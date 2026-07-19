#!/usr/bin/env bash
# ============================================================
# deploy-xifeng.sh — xifeng.net 本地构建 + 同步部署（不走 GHA）
#
# 三端一致：本地 Git HEAD == 远程 origin == 服务器容器 .deploy-revision
#
# 流程：
#   1. 检查工作区干净、可选 git push
#   2. 本地 preflight（typecheck / build / test）
#   3. docker build linux/amd64 → utterlog-app:local
#   4. docker save | ssh load → 124.222.230.137
#   5. rsync compose 文件，force-recreate app 容器
#   6. 健康检查 + revision 校验
#
# 用法：
#   bash scripts/deploy-xifeng.sh              # 标准部署
#   bash scripts/deploy-xifeng.sh --no-push    # 不 push（仅本地 commit 与线上一致时）
#   bash scripts/deploy-xifeng.sh --skip-tests   # 跳过测试（不推荐）
#   bash scripts/deploy-xifeng.sh --dry-run      # 只跑 preflight，不构建/上传
#
# 环境变量（可覆盖）：
#   UTTERLOG_DEPLOY_HOST   默认 124.222.230.137
#   UTTERLOG_DEPLOY_USER   默认 root
#   UTTERLOG_DEPLOY_PATH   默认 /opt/utterlog-xifeng
#   UTTERLOG_SSH_KEY       默认 ~/Desktop/gentpan.pem 或 ~/.ssh/gentpan.pem
#   UTTERLOG_GIT_REMOTE    默认 origin
#   UTTERLOG_GIT_BRANCH    默认当前分支
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HOST="${UTTERLOG_DEPLOY_HOST:-124.222.230.137}"
USER="${UTTERLOG_DEPLOY_USER:-root}"
REMOTE_PATH="${UTTERLOG_DEPLOY_PATH:-/opt/utterlog-xifeng}"
GIT_REMOTE="${UTTERLOG_GIT_REMOTE:-origin}"
GIT_BRANCH="${UTTERLOG_GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
APP_URL="${UTTERLOG_APP_URL:-https://xifeng.net}"
PLATFORM="${UTTERLOG_DOCKER_PLATFORM:-linux/amd64}"
IMAGE_NAME="${UTTERLOG_IMAGE_NAME:-utterlog-app}"
IMAGE_TAG="${UTTERLOG_IMAGE_TAG:-local}"

SKIP_TESTS=0
SKIP_PUSH=0
DRY_RUN=0
ALLOW_DIRTY=0

for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=1 ;;
    --no-push) SKIP_PUSH=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    -h|--help)
      sed -n '2,28p' "$0"
      exit 0
      ;;
    *)
      echo "未知参数: $arg（可用 --help）" >&2
      exit 1
      ;;
  esac
done

if [ -t 1 ]; then
  C_BLUE=$'\e[34m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'
  C_RED=$'\e[31m'; C_BOLD=$'\e[1m'; C_RESET=$'\e[0m'
else
  C_BLUE=; C_GREEN=; C_YELLOW=; C_RED=; C_BOLD=; C_RESET=
fi

log()  { printf "%s==>%s %s\n" "$C_BLUE$C_BOLD" "$C_RESET" "$*"; }
ok()   { printf "%s✓%s %s\n" "$C_GREEN$C_BOLD" "$C_RESET" "$*"; }
warn() { printf "%s!%s %s\n" "$C_YELLOW$C_BOLD" "$C_RESET" "$*"; }
err()  { printf "%s✗%s %s\n" "$C_RED$C_BOLD" "$C_RESET" "$*" >&2; }

resolve_ssh_key() {
  if [ -n "${UTTERLOG_SSH_KEY:-}" ] && [ -f "$UTTERLOG_SSH_KEY" ]; then
    echo "$UTTERLOG_SSH_KEY"
    return
  fi
  for candidate in \
    "$HOME/Desktop/gentpan.pem" \
    "$HOME/.ssh/gentpan.pem"; do
    if [ -f "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
  err "找不到 SSH 私钥。设置 UTTERLOG_SSH_KEY 或放置 gentpan.pem 于 Desktop / ~/.ssh/"
  exit 1
}

SSH_KEY="$(resolve_ssh_key)"
chmod 600 "$SSH_KEY" 2>/dev/null || true
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "${USER}@${HOST}")
SCP=(scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)

require_cmd() {
  for bin in "$@"; do
    if ! command -v "$bin" >/dev/null 2>&1; then
      err "缺少命令: $bin"
      exit 1
    fi
  done
}

require_cmd git bun gzip

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  HAS_LOCAL_DOCKER=1
else
  HAS_LOCAL_DOCKER=0
fi

GIT_SHA="$(git rev-parse HEAD)"
GIT_SHA_SHORT="$(git rev-parse --short HEAD)"

log "部署目标: ${USER}@${HOST}:${REMOTE_PATH}"
log "Git: ${GIT_BRANCH} @ ${GIT_SHA_SHORT}"

if [ "$ALLOW_DIRTY" -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
  err "工作区有未提交改动。请先 commit，或加 --allow-dirty（三端将无法保证一致）"
  git status --short
  exit 1
fi

if [ "$SKIP_PUSH" -eq 0 ]; then
  log "推送到 ${GIT_REMOTE}/${GIT_BRANCH} ..."
  git push "${GIT_REMOTE}" "${GIT_BRANCH}"
  REMOTE_SHA="$({ git ls-remote "${GIT_REMOTE}" "refs/heads/${GIT_BRANCH}" 2>/dev/null || true; } | awk '{print $1}')"
  if [ -n "$REMOTE_SHA" ] && [ "$REMOTE_SHA" != "$GIT_SHA" ]; then
    err "远程 ${GIT_REMOTE}/${GIT_BRANCH} 与本地 HEAD 不一致（remote=${REMOTE_SHA:0:7} local=${GIT_SHA_SHORT}）"
    exit 1
  fi
  ok "Git 远程与本地一致: ${GIT_SHA_SHORT}"
else
  warn "跳过 git push（--no-push）"
fi

preflight() {
  log "Preflight: bun install --frozen-lockfile"
  bun install --frozen-lockfile

  log "Preflight: server typecheck"
  bun run server:check

  log "Preflight: admin build (Vite 8)"
  (cd app/admin && bun run build)

  log "Preflight: TanStack Start build"
  bun run start:build

  if [ "$SKIP_TESTS" -eq 0 ]; then
    log "Preflight: server tests"
    JWT_SECRET=test-secret-for-server-tests bun test app/start/test
  else
    warn "跳过 server tests（--skip-tests）"
  fi
}

preflight
ok "Preflight 通过"

if [ "$DRY_RUN" -eq 1 ]; then
  ok "Dry run 完成，未构建/上传"
  exit 0
fi

IMAGE_REF="${IMAGE_NAME}:${IMAGE_TAG}"
IMAGE_SHA_REF="${IMAGE_NAME}:${GIT_SHA_SHORT}"

remote_compose_and_restart() {
  "${SSH[@]}" bash -s <<EOF
set -euo pipefail
cd ${REMOTE_PATH}
docker network inspect utterlog_default >/dev/null 2>&1 || docker network create utterlog_default
docker compose -f docker-compose.infra.yml up -d
docker compose -f docker-compose.bun.yml up -d --force-recreate --no-deps app
EOF
}

remote_build_from_src() {
  log "git archive 同步源码到服务器并在远端 docker build ..."
  "${SSH[@]}" "rm -rf ${REMOTE_PATH}/src && mkdir -p ${REMOTE_PATH}/src"
  git archive HEAD | "${SSH[@]}" "tar xf - -C ${REMOTE_PATH}/src"
  "${SSH[@]}" bash -s <<EOF
set -euo pipefail
test -f ${REMOTE_PATH}/src/app/start/src/backend/backup/zip-safety.ts
cd ${REMOTE_PATH}
docker tag ${IMAGE_REF} ${IMAGE_NAME}:backup-\$(date +%Y%m%d%H%M%S) 2>/dev/null || true
cd src
docker build \
  --build-arg GIT_SHA=${GIT_SHA} \
  --build-arg GIT_BRANCH=${GIT_BRANCH} \
  -f Dockerfile.bun \
  -t ${IMAGE_REF} \
  -t ${IMAGE_SHA_REF} \
  .
cp deploy/xifeng/docker-compose.bun.yml ../docker-compose.bun.yml
cp deploy/xifeng/docker-compose.infra.yml ../docker-compose.infra.yml
EOF
}

log "备份服务器旧镜像 ..."
"${SSH[@]}" "docker tag ${IMAGE_REF} ${IMAGE_NAME}:backup-\$(date +%Y%m%d%H%M%S) 2>/dev/null || true"

if [ "$HAS_LOCAL_DOCKER" -eq 1 ]; then
  log "本地构建镜像 ${IMAGE_REF} (${PLATFORM}) ..."
  docker build \
    --platform "$PLATFORM" \
    -f Dockerfile.bun \
    --build-arg "GIT_SHA=${GIT_SHA}" \
    --build-arg "GIT_BRANCH=${GIT_BRANCH}" \
    -t "$IMAGE_REF" \
    -t "$IMAGE_SHA_REF" \
    .
  ok "镜像构建完成"
  log "上传镜像到服务器（gzip 流式传输，请稍候）..."
  docker save "$IMAGE_REF" | gzip -1 | "${SSH[@]}" 'gunzip | docker load'
  ok "镜像已 load 到服务器"
  log "同步 compose 文件 ..."
  "${SSH[@]}" "mkdir -p ${REMOTE_PATH}"
  "${SCP[@]}" \
    deploy/xifeng/docker-compose.bun.yml \
    deploy/xifeng/docker-compose.infra.yml \
    "${USER}@${HOST}:${REMOTE_PATH}/"
  log "重启 app 容器 ..."
  remote_compose_and_restart
else
  warn "本地未检测到 Docker，改用 git archive + 服务器构建"
  remote_build_from_src
  log "重启 app 容器 ..."
  remote_compose_and_restart
fi

log "等待健康检查 (${APP_URL}) ..."
HEALTHY=0
for i in $(seq 1 24); do
  if curl -fsS "${APP_URL}/api/v1/install/status" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 5
done

if [ "$HEALTHY" -eq 0 ]; then
  err "健康检查超时。查看日志: ssh -i ${SSH_KEY} ${USER}@${HOST} 'docker logs utterlog-xifeng-app --tail 50'"
  exit 1
fi

REMOTE_REV="$("${SSH[@]}" "docker exec utterlog-xifeng-app cat /app/.deploy-revision 2>/dev/null | tr -d '\n'" || true)"

if [ "$REMOTE_REV" != "$GIT_SHA" ]; then
  err "Revision 不一致: 期望 ${GIT_SHA}，容器内 ${REMOTE_REV:-<empty>}"
  exit 1
fi

ok "部署成功 — 三端一致"
printf "\n"
printf "  站点:     %s\n" "$APP_URL"
printf "  Git:      %s (%s)\n" "$GIT_SHA_SHORT" "$GIT_BRANCH"
printf "  容器:     utterlog-xifeng-app @ %s\n" "$REMOTE_REV"
printf "  SSH:      ssh -i %s %s@%s\n" "$SSH_KEY" "$USER" "$HOST"
printf "\n"
