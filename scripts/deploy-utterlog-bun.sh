#!/usr/bin/env bash
# ============================================================
# Utterlog 远程部署（Bun + systemd）
# ------------------------------------------------------------
#   本地构建 dist → rsync 源码+dist 到服务器 → 服务器 bun install
#   → 重启 systemd 服务 → 健康检查。
#
#   运行时（示例拓扑）：
#     - app  = systemd `utterlog-app`，host Bun 跑 app/start/src/backend/index.ts
#              监听 .env 里的 HOST/PORT（默认 127.0.0.1:9260）
#     - db   = host PostgreSQL 18（.env 里 DB_HOST=127.0.0.1 DB_PORT=5432）
#     - 对外 = 反代（如 Caddy/Nginx）→ 本机 Bun 端口
#
#   用法：
#     bash scripts/deploy-utterlog-bun.sh                # 构建+部署
#     bash scripts/deploy-utterlog-bun.sh --skip-tests   # 跳过 server tests
#     bash scripts/deploy-utterlog-bun.sh --no-build     # 只 rsync+重启（复用已有 dist）
#     bash scripts/deploy-utterlog-bun.sh --dry-run      # 只做本地校验
#
#   环境变量（必填 / 可覆盖）：
#     UTTERLOG_DEPLOY_HOST  必填，无默认值（部署服务器 IP/域名）
#     UTTERLOG_DEPLOY_USER  默认 root
#     UTTERLOG_DEPLOY_PATH  必填，无默认值（服务器上的部署目录）
#     UTTERLOG_SERVICE      默认 utterlog-app
#     UTTERLOG_REMOTE_BUN   默认 /opt/bun/bin/bun
#     UTTERLOG_REMOTE_PORT  可选；默认读取服务器 .env 的 PORT
#     UTTERLOG_SSH_KEY      必填，无默认值（SSH 私钥路径）
#     UTTERLOG_APP_URL      必填，无默认值（如 https://your-domain.com，用于部署完成提示）
# ============================================================
set -euo pipefail

SKIP_TESTS=0
BUILD=1
DRY_RUN=0
usage() {
  sed -n '3,34p' "$0" | sed 's/^# \{0,1\}//'
}
for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=1 ;;
    --no-build)   BUILD=0 ;;
    --dry-run)    DRY_RUN=1 ;;
    --no-push|--allow-dirty) : ;; # 兼容旧入口；此流程不执行 git push
    -h|--help)    usage; exit 0 ;;
    *) echo "未知参数: $arg（-h 看帮助）"; exit 1 ;;
  esac
done

HOST="${UTTERLOG_DEPLOY_HOST:?请设置 UTTERLOG_DEPLOY_HOST（部署服务器 IP/域名）}"
USER="${UTTERLOG_DEPLOY_USER:-root}"
REMOTE_PATH="${UTTERLOG_DEPLOY_PATH:?请设置 UTTERLOG_DEPLOY_PATH（服务器上的部署目录）}"
SERVICE="${UTTERLOG_SERVICE:-utterlog-app}"
REMOTE_BUN="${UTTERLOG_REMOTE_BUN:-/opt/bun/bin/bun}"
HEALTH_PATH="/api/v1/install/status"
APP_URL="${UTTERLOG_APP_URL:?请设置 UTTERLOG_APP_URL（如 https://your-domain.com）}"

case "$USER" in (*[!a-zA-Z0-9_.-]*|'') echo "UTTERLOG_DEPLOY_USER 无效: $USER" >&2; exit 1 ;; esac
case "$HOST" in (*[!a-zA-Z0-9_.:-]*|'') echo "UTTERLOG_DEPLOY_HOST 无效: $HOST" >&2; exit 1 ;; esac
case "$REMOTE_PATH" in (/*) ;; (*) echo 'UTTERLOG_DEPLOY_PATH 必须是绝对路径' >&2; exit 1 ;; esac
case "$REMOTE_PATH" in (*[!a-zA-Z0-9_./-]*) echo "UTTERLOG_DEPLOY_PATH 含不支持的字符: $REMOTE_PATH" >&2; exit 1 ;; esac
case "$SERVICE" in (*[!a-zA-Z0-9_.@-]*|'') echo "UTTERLOG_SERVICE 无效: $SERVICE" >&2; exit 1 ;; esac
case "$REMOTE_BUN" in (/*) ;; (*) echo 'UTTERLOG_REMOTE_BUN 必须是绝对路径' >&2; exit 1 ;; esac
case "$REMOTE_BUN" in (*[!a-zA-Z0-9_./-]*) echo "UTTERLOG_REMOTE_BUN 含不支持的字符: $REMOTE_BUN" >&2; exit 1 ;; esac

C_B=$'\e[34;1m'; C_G=$'\e[32;1m'; C_Y=$'\e[33;1m'; C_R=$'\e[31;1m'; C_0=$'\e[0m'
log()  { printf "%s==>%s %s\n" "$C_B" "$C_0" "$*"; }
ok()   { printf "%s✓%s %s\n"  "$C_G" "$C_0" "$*"; }
warn() { printf "%s!%s %s\n"  "$C_Y" "$C_0" "$*"; }
err()  { printf "%s✗%s %s\n"  "$C_R" "$C_0" "$*" >&2; exit 1; }

resolve_ssh_key() {
  if [ -n "${UTTERLOG_SSH_KEY:-}" ] && [ -f "$UTTERLOG_SSH_KEY" ]; then echo "$UTTERLOG_SSH_KEY"; return; fi
  for c in "$HOME/.ssh/id_ed25519" "$HOME/.ssh/id_rsa"; do
    [ -f "$c" ] && { echo "$c"; return; }
  done
  err "找不到 SSH 私钥。设置 UTTERLOG_SSH_KEY 指向部署私钥"
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

if [ "$DRY_RUN" -eq 1 ]; then
  ok "Dry run 完成，未同步或重启远程服务"
  exit 0
fi

# ---- 2. rsync 到服务器（排除 node_modules；不碰 content/uploads/.env/pgdata）----
"${SSH[@]}" "mkdir -p '${REMOTE_PATH}/app' '${REMOTE_PATH}/scripts'"
log "rsync 根依赖清单文件"
rsync -az -e "$RSYNC_SSH" package.json bun.lock bunfig.toml tsconfig.json "${USER}@${HOST}:${REMOTE_PATH}/"
rsync -az -e "$RSYNC_SSH" scripts/update-bun.sh "${USER}@${HOST}:${REMOTE_PATH}/scripts/"
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
app_user=\$(systemctl show -p User --value ${SERVICE})
app_group=\$(id -gn "\$app_user")
chown -R "\$app_user:\$app_group" app scripts package.json bun.lock bunfig.toml tsconfig.json
app_home=\$(getent passwd "\$app_user" | cut -d: -f6)
runuser -u "\$app_user" -- env HOME="\$app_home" PATH=/opt/bun/bin:/usr/local/bin:/usr/bin:/bin \
  ${REMOTE_BUN} install --frozen-lockfile
runuser -u "\$app_user" -- env HOME="\$app_home" PATH=/opt/bun/bin:/usr/local/bin:/usr/bin:/bin \
  ${REMOTE_BUN} app/start/src/web/scripts/sync-theme-styles.mjs
EOF
ok "服务器依赖就绪"

# ---- 4. 重启服务 + 健康检查 ----
log "重启 ${SERVICE}"
"${SSH[@]}" "systemctl restart ${SERVICE}"
REMOTE_PORT="${UTTERLOG_REMOTE_PORT:-}"
if [ -z "$REMOTE_PORT" ]; then
  REMOTE_PORT="$("${SSH[@]}" "sed -n 's/^PORT=//p' '${REMOTE_PATH}/.env' | tail -n 1 | tr -d '\"\047\r'" || true)"
fi
REMOTE_PORT="${REMOTE_PORT:-9260}"
case "$REMOTE_PORT" in (*[!0-9]*|'') err "服务器 PORT 无效: $REMOTE_PORT" ;; esac
log "健康检查（本机 127.0.0.1:${REMOTE_PORT}${HEALTH_PATH}）"
for i in $(seq 1 20); do
  code="$("${SSH[@]}" "curl -s -o /dev/null -w '%{http_code}' -m5 http://127.0.0.1:${REMOTE_PORT}${HEALTH_PATH}" || true)"
  [ "$code" = "200" ] && { ok "健康检查通过 (200)"; break; }
  [ "$i" = "20" ] && err "健康检查超时（末次 code=$code）。查看: ssh -i ${SSH_KEY} ${USER}@${HOST} 'journalctl -u ${SERVICE} -n 50'"
  sleep 3
done

REV="$("${SSH[@]}" "cd ${REMOTE_PATH} && ${REMOTE_BUN} -e 'console.log(require(\"./package.json\").version)'" 2>/dev/null || true)"
ok "部署完成${REV:+（app 版本 $REV）}"
printf "  站点: %s/\n  日志: ssh -i %s %s@%s 'journalctl -u %s -f'\n" "$APP_URL" "$SSH_KEY" "$USER" "$HOST" "$SERVICE"
