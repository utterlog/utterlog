#!/usr/bin/env bash
# ============================================================
# Utterlog xifeng.net 部署（无 Docker 版）
# ------------------------------------------------------------
#   本地构建 dist → rsync 源码+dist 到服务器 → 服务器 bun install
#   → 重启 systemd 服务 → 健康检查。全程不碰 Docker / Docker Hub。
#
#   运行时（服务器 62）：
#     - app  = systemd `utterlog-app`，host Bun 跑 app/start/src/backend/index.ts
#              监听 127.0.0.1:9261（.env 里 HOST=127.0.0.1 PORT=9261）
#     - db   = host PostgreSQL 18（.env 里 DB_HOST=127.0.0.1 DB_PORT=5432）
#     - 对外 = FrankenPHP 反代 xifeng.net → 127.0.0.1:9261
#
#   用法：
#     bash scripts/deploy-xifeng-bun.sh                # 构建+部署
#     bash scripts/deploy-xifeng-bun.sh --skip-tests   # 跳过 server tests
#     bash scripts/deploy-xifeng-bun.sh --no-build     # 只 rsync+重启（复用已有 dist）
#
#   环境变量：
#     UTTERLOG_DEPLOY_HOST  默认 106.54.200.62
#     UTTERLOG_DEPLOY_USER  默认 root
#     UTTERLOG_DEPLOY_PATH  默认 /opt/utterlog-xifeng
#     UTTERLOG_SERVICE      默认 utterlog-app
#     UTTERLOG_REMOTE_BUN   默认 /opt/bun/bin/bun
#     UTTERLOG_SSH_KEY      默认 ~/Desktop/gentpan.pem 或 ~/.ssh/gentpan.pem
# ============================================================
set -euo pipefail

HOST="${UTTERLOG_DEPLOY_HOST:-106.54.200.62}"
USER="${UTTERLOG_DEPLOY_USER:-root}"
REMOTE_PATH="${UTTERLOG_DEPLOY_PATH:-/opt/utterlog-xifeng}"
SERVICE="${UTTERLOG_SERVICE:-utterlog-app}"
REMOTE_BUN="${UTTERLOG_REMOTE_BUN:-/opt/bun/bin/bun}"
HEALTH_PATH="/api/v1/install/status"
LOCAL_PORT_CHECK=9261

SKIP_TESTS=0
BUILD=1
for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=1 ;;
    --no-build)   BUILD=0 ;;
    -h|--help)    grep -E '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $arg（-h 看帮助）"; exit 1 ;;
  esac
done

C_B=$'\e[34;1m'; C_G=$'\e[32;1m'; C_Y=$'\e[33;1m'; C_R=$'\e[31;1m'; C_0=$'\e[0m'
log()  { printf "%s==>%s %s\n" "$C_B" "$C_0" "$*"; }
ok()   { printf "%s✓%s %s\n"  "$C_G" "$C_0" "$*"; }
warn() { printf "%s!%s %s\n"  "$C_Y" "$C_0" "$*"; }
err()  { printf "%s✗%s %s\n"  "$C_R" "$C_0" "$*" >&2; exit 1; }

resolve_ssh_key() {
  if [ -n "${UTTERLOG_SSH_KEY:-}" ] && [ -f "$UTTERLOG_SSH_KEY" ]; then echo "$UTTERLOG_SSH_KEY"; return; fi
  for c in "$HOME/Desktop/gentpan.pem" "$HOME/.ssh/gentpan.pem"; do
    [ -f "$c" ] && { echo "$c"; return; }
  done
  err "找不到 SSH 私钥。设置 UTTERLOG_SSH_KEY 或放 gentpan.pem 于 Desktop / ~/.ssh/"
}
SSH_KEY="$(resolve_ssh_key)"; chmod 600 "$SSH_KEY" 2>/dev/null || true
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "${USER}@${HOST}")
RSYNC_SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
log "部署目标: ${USER}@${HOST}:${REMOTE_PATH}  服务: ${SERVICE}"

# ---- 1. 本地构建（纯 JS dist，可跨平台传输；backend 直接跑 TS 源码不需构建）----
if [ "$BUILD" -eq 1 ]; then
  log "本地: bun install --frozen-lockfile"; bun install --frozen-lockfile
  log "本地: server typecheck";              bun run server:check
  log "本地: admin 构建 (Vite)";             (cd app/admin && bun run build)
  log "本地: start(web) 构建";               bun run start:build
  if [ "$SKIP_TESTS" -eq 0 ]; then
    log "本地: server tests"; JWT_SECRET=test-secret-for-server-tests bun test app/start/test
  else warn "跳过 server tests（--skip-tests）"; fi
else
  warn "跳过本地构建（--no-build），复用现有 dist"
fi
[ -f app/admin/dist/client/index.html ] || err "缺少 app/admin/dist（先构建，别带 --no-build）"
[ -d app/start/dist ]                   || err "缺少 app/start/dist（先构建）"
ok "构建产物就绪"

# ---- 2. rsync 到服务器（排除 node_modules；不碰 content/uploads/.env/pgdata）----
log "rsync 根依赖清单文件"
rsync -az -e "$RSYNC_SSH" package.json bun.lock bunfig.toml tsconfig.json "${USER}@${HOST}:${REMOTE_PATH}/"
log "rsync app/（含 dist，排除 node_modules）"
rsync -az --delete -e "$RSYNC_SSH" --exclude node_modules --exclude .DS_Store \
  app/ "${USER}@${HOST}:${REMOTE_PATH}/app/"
ok "源码+dist 已同步"

# ---- 3. 服务器端装依赖（原生模块必须服务器装）+ 同步主题样式 ----
log "服务器: bun install --frozen-lockfile + sync-theme-styles"
"${SSH[@]}" bash -s <<EOF
set -euo pipefail
cd ${REMOTE_PATH}
export PATH=/opt/bun/bin:\$PATH
${REMOTE_BUN} install --frozen-lockfile
${REMOTE_BUN} app/start/src/web/scripts/sync-theme-styles.mjs
EOF
ok "服务器依赖就绪"

# ---- 4. 重启服务 + 健康检查 ----
log "重启 ${SERVICE}"
"${SSH[@]}" "systemctl restart ${SERVICE}"
log "健康检查（本机 127.0.0.1:${LOCAL_PORT_CHECK}${HEALTH_PATH}）"
for i in $(seq 1 20); do
  code="$("${SSH[@]}" "curl -s -o /dev/null -w '%{http_code}' -m5 http://127.0.0.1:${LOCAL_PORT_CHECK}${HEALTH_PATH}" || true)"
  [ "$code" = "200" ] && { ok "健康检查通过 (200)"; break; }
  [ "$i" = "20" ] && err "健康检查超时（末次 code=$code）。查看: ssh -i ${SSH_KEY} ${USER}@${HOST} 'journalctl -u ${SERVICE} -n 50'"
  sleep 3
done

REV="$("${SSH[@]}" "cd ${REMOTE_PATH} && ${REMOTE_BUN} -e 'console.log(require(\"./package.json\").version)'" 2>/dev/null || true)"
ok "部署完成${REV:+（app 版本 $REV）}"
printf "  站点: https://xifeng.net/\n  日志: ssh -i %s %s@%s 'journalctl -u %s -f'\n" "$SSH_KEY" "$USER" "$HOST" "$SERVICE"
