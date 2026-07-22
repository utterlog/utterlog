#!/usr/bin/env bash
# Update a host-installed Utterlog instance, rebuild it with Bun, and restart systemd.
set -Eeuo pipefail

RUNTIME_REQUEST=0
for arg in "$@"; do
  case "$arg" in
    --runtime) RUNTIME_REQUEST=1 ;;
    -h|--help)
      printf '%s\n' \
        'Usage: sudo bash scripts/update-bun.sh [--runtime]' \
        '' \
        'Pulls the current Git branch, verifies and builds with Bun, then restarts utterlog-app.'
      exit 0
      ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

ROOT="${UTTERLOG_INSTALL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

env_value() {
  local key="$1" fallback="$2" value=""
  if [ -f "$ROOT/.env" ]; then
    value="$(sed -n "s/^${key}=//p" "$ROOT/.env" | tail -1 | tr -d '\r' | sed 's/^['\"'\'']//;s/['\"'\'']$//')"
  fi
  printf '%s' "${value:-$fallback}"
}

SERVICE="${UTTERLOG_SERVICE:-$(env_value UTTERLOG_SERVICE utterlog-app)}"
APP_USER="${UTTERLOG_SERVICE_USER:-$(env_value UTTERLOG_SERVICE_USER utterlog)}"
BUN_BIN="${UTTERLOG_BUN_BIN:-$(command -v bun || true)}"
REQUEST_FILE="${UTTERLOG_UPDATE_REQUEST_FILE:-$(env_value UTTERLOG_UPDATE_REQUEST_FILE "$ROOT/.runtime/update.request")}"
LOG_FILE="${UTTERLOG_UPDATE_LOG:-$ROOT/uploads/upgrade.log}"
LOCK_FILE="${UTTERLOG_UPDATE_LOCK:-$ROOT/.runtime/update.lock}"

case "$SERVICE" in (*[!a-zA-Z0-9_.@-]*|'') printf 'Invalid systemd service name: %s\n' "$SERVICE" >&2; exit 1 ;; esac
case "$APP_USER" in (*[!a-zA-Z0-9_-]*|'') printf 'Invalid service user: %s\n' "$APP_USER" >&2; exit 1 ;; esac

[ -n "$BUN_BIN" ] && [ -x "$BUN_BIN" ] || { printf 'Bun executable not found. Set UTTERLOG_BUN_BIN.\n' >&2; exit 1; }
[ -d "$ROOT/.git" ] || { printf 'Utterlog install is not a Git checkout: %s\n' "$ROOT" >&2; exit 1; }

mkdir -p "$(dirname "$REQUEST_FILE")" "$(dirname "$LOG_FILE")" "$(dirname "$LOCK_FILE")"
rm -f "$REQUEST_FILE"
touch "$LOG_FILE"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  flock -n 9 || { printf 'Another Utterlog update is already running.\n' >&2; exit 1; }
fi

exec > >(tee -a "$LOG_FILE") 2>&1

ts() { date '+%Y/%m/%d %H:%M:%S'; }
log() { printf '%s %s\n' "$(ts)" "$*"; }

failed() {
  local code=$?
  rm -f "$REQUEST_FILE"
  log "ERROR 更新任务失败（exit=$code）"
  log '升级应用 [Utterlog] 失败 [TASK-END]'
  exit "$code"
}
trap failed ERR

app_home() {
  getent passwd "$APP_USER" 2>/dev/null | cut -d: -f6
}

run_as_app() {
  if [ "$(id -u)" -eq 0 ] && [ "$APP_USER" != root ] && id "$APP_USER" >/dev/null 2>&1; then
    runuser -u "$APP_USER" -- env \
      HOME="$(app_home)" \
      PATH="$(dirname "$BUN_BIN"):/usr/local/bin:/usr/bin:/bin" \
      "$@"
  else
    "$@"
  fi
}

cd "$ROOT"
log '升级应用 [Utterlog] 任务开始 [START]'
log "安装目录 [$ROOT]"
log "Bun [$($BUN_BIN --version)]"

OLD_REV="$(git rev-parse HEAD)"
BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"
[ -n "$BRANCH" ] || { log 'ERROR 当前 Git checkout 不在分支上'; false; }

log "拉取源码 [$BRANCH]"
run_as_app git fetch --tags origin "$BRANCH"
run_as_app git merge --ff-only "origin/$BRANCH"
NEW_REV="$(git rev-parse HEAD)"
log "源码版本 [${OLD_REV:0:12} -> ${NEW_REV:0:12}]"

log '安装 Bun 依赖'
run_as_app "$BUN_BIN" install --frozen-lockfile
log '类型检查、构建、测试与 API 审计'
run_as_app "$BUN_BIN" run verify

if command -v systemctl >/dev/null 2>&1; then
  log "重启 systemd 服务 [$SERVICE]"
  if [ "$(id -u)" -eq 0 ]; then
    systemctl restart "$SERVICE"
  else
    sudo systemctl restart "$SERVICE"
  fi
else
  log 'ERROR 未检测到 systemctl，无法重启应用服务'
  false
fi

PORT_VALUE="$(env_value PORT 9260)"
log "等待健康检查 [127.0.0.1:${PORT_VALUE}]"
healthy=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${PORT_VALUE}/api/v1/install/status" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done
[ "$healthy" -eq 1 ] || { log "ERROR 健康检查超时，请执行 journalctl -u $SERVICE -n 100"; false; }

rm -f "$REQUEST_FILE"
trap - ERR
log "当前源码 [$NEW_REV]"
log '升级应用 [Utterlog] 成功 [TASK-END]'

if [ "$RUNTIME_REQUEST" -eq 0 ]; then
  printf 'Utterlog updated successfully.\n'
fi
