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
        'Builds the next version separately, verifies the running site, and rolls back on failure.' \
        'Set UTTERLOG_UPDATE_TAG to select a release when installed from a tag.'
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

mkdir -p "$ROOT/.runtime" "$(dirname "$REQUEST_FILE")" "$(dirname "$LOG_FILE")" "$(dirname "$LOCK_FILE")"
touch "$LOG_FILE"

exec 9>"$LOCK_FILE"
flock -n 9 || { printf 'Another Utterlog update is already running.\n' >&2; exit 1; }
rm -f "$REQUEST_FILE"

exec > >(tee -a "$LOG_FILE") 2>&1

ts() { date '+%Y/%m/%d %H:%M:%S'; }
log() { printf '%s %s\n' "$(ts)" "$*"; }

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

ARTIFACTS=(node_modules app/start/node_modules app/admin/node_modules app/start/dist app/admin/dist)
SWITCHED=()
STAGE=""
PREVIOUS=""
SWITCHING=0
OLD_REV=""
PORT_VALUE="$(env_value PORT 9260)"
HOST_URL="http://127.0.0.1:${PORT_VALUE}"
ATTEMPTS="${UTTERLOG_HEALTH_ATTEMPTS:-60}"

systemd() {
  if [ "$(id -u)" -eq 0 ]; then
    systemctl "$@" "$SERVICE" 9>&-
  else
    sudo systemctl "$@" "$SERVICE" 9>&-
  fi
}

cleanup_stage() {
  if [ -n "$STAGE" ]; then
    run_as_app git worktree remove --force "$STAGE" >/dev/null 2>&1 || true
  fi
}

failed() {
  local code="$1" path rollback_ok=1
  trap - ERR
  trap '' INT TERM
  set +e
  if [ "$SWITCHING" -eq 1 ]; then
    log "恢复上一版本 [$OLD_REV]"
    if systemd stop; then
      run_as_app git reset --keep "$OLD_REV" || rollback_ok=0
      for path in "${SWITCHED[@]}"; do
        if [ -e "$ROOT/$path" ] || [ -L "$ROOT/$path" ]; then
          run_as_app mkdir -p "$STAGE/$(dirname "$path")"
          run_as_app mv "$ROOT/$path" "$STAGE/$path" || rollback_ok=0
        fi
        if [ -e "$PREVIOUS/$path" ] || [ -L "$PREVIOUS/$path" ]; then
          run_as_app mv "$PREVIOUS/$path" "$ROOT/$path" || rollback_ok=0
        fi
      done
      systemd start || rollback_ok=0
      for attempt in $(seq 1 "$ATTEMPTS"); do
        if bash "$CHECK_HOST" "$HOST_URL" "$BUN_BIN"; then break; fi
        if [ "$attempt" -eq "$ATTEMPTS" ]; then rollback_ok=0; else sleep 2; fi
      done
    else
      rollback_ok=0
    fi
    if [ "$rollback_ok" -eq 1 ]; then log '上一版本已恢复'; else log "ERROR 自动回退未完成，上一版本产物保存在 $PREVIOUS"; fi
  fi
  if [ "$rollback_ok" -eq 1 ]; then cleanup_stage; fi
  rm -f "$REQUEST_FILE"
  log "ERROR 更新任务失败（exit=$code）"
  log '升级应用 [Utterlog] 失败 [TASK-END]'
  exit "$code"
}

cd "$ROOT"
trap 'failed $?' ERR
trap 'failed 130' INT
trap 'failed 143' TERM
log '升级应用 [Utterlog] 任务开始 [START]'
log "安装目录 [$ROOT]"
log "Bun [$($BUN_BIN --version)]"

case "$ATTEMPTS" in (*[!0-9]*|''|0) log 'ERROR invalid UTTERLOG_HEALTH_ATTEMPTS'; false ;; esac
[ -z "$(run_as_app git status --porcelain --untracked-files=no)" ] || { log 'ERROR 源码存在未提交修改'; false; }
OLD_REV="$(run_as_app git rev-parse HEAD)"
BRANCH="$(run_as_app git symbolic-ref --quiet --short HEAD || true)"
if [ -n "$BRANCH" ]; then
  run_as_app git fetch origin "$BRANCH"
  NEW_REV="$(run_as_app git rev-parse FETCH_HEAD)"
  run_as_app git merge-base --is-ancestor "$OLD_REV" "$NEW_REV"
else
  TAG="${UTTERLOG_UPDATE_TAG:-}"
  if [ -z "$TAG" ]; then
    TAG="$(curl -fsS --max-time 20 https://api.github.com/repos/utterlog/utterlog/releases/latest | "$BUN_BIN" -e '
      const release = await Bun.stdin.json();
      if (!release.assets?.some((asset) => asset.name === "install.sh")) process.exit(1);
      console.log(release.tag_name);
    ')"
  fi
  [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { log 'ERROR 无效的发布版本'; false; }
  run_as_app git fetch origin "refs/tags/$TAG"
  NEW_REV="$(run_as_app git rev-parse 'FETCH_HEAD^{commit}')"
fi
log "源码版本 [${OLD_REV:0:12} -> ${NEW_REV:0:12}]"

STAGE="$(run_as_app mktemp -d "$ROOT/.runtime/build.XXXXXX")"
run_as_app git worktree add --detach "$STAGE" "$NEW_REV"
log '在独立目录安装依赖、构建和验证'
(cd "$STAGE" && run_as_app "$BUN_BIN" install --frozen-lockfile && \
  run_as_app env UTTERLOG_INTEGRATION_DB=0 UTTERLOG_RESTORE_INTEGRATION_DB=0 "$BUN_BIN" run verify) || failed $?
for path in "${ARTIFACTS[@]}"; do [ -d "$STAGE/$path" ]; done

PREVIOUS="$(run_as_app mktemp -d "$ROOT/.runtime/previous.XXXXXX")"
CHECK_HOST="$PREVIOUS/check-host.sh"
run_as_app cp "$STAGE/scripts/check-host.sh" "$CHECK_HOST"
printf '%s\n' "$OLD_REV" > "$PREVIOUS/commit"
SWITCHING=1
systemd stop
if [ -n "$BRANCH" ]; then
  run_as_app git merge --ff-only "$NEW_REV"
else
  run_as_app git checkout --detach "$NEW_REV"
fi
for path in "${ARTIFACTS[@]}"; do
  run_as_app mkdir -p "$PREVIOUS/$(dirname "$path")"
  if [ -e "$ROOT/$path" ] || [ -L "$ROOT/$path" ]; then
    run_as_app mv "$ROOT/$path" "$PREVIOUS/$path"
  fi
  SWITCHED+=("$path")
  run_as_app mv "$STAGE/$path" "$ROOT/$path"
done
systemd start

log "等待数据库、运行版本、首页和后台通过检查 [$HOST_URL]"
for attempt in $(seq 1 "$ATTEMPTS"); do
  if bash "$CHECK_HOST" "$HOST_URL" "$BUN_BIN" "$NEW_REV"; then break; fi
  if [ "$attempt" -eq "$ATTEMPTS" ]; then
    log "ERROR 健康检查超时，请查看 journalctl -u $SERVICE -n 100"
    false
  fi
  sleep 2
done

SWITCHING=0
cleanup_stage
trap - ERR INT TERM
# Keep the immediate previous version and discard older snapshots created here.
for old in "$ROOT"/.runtime/previous.*; do
  if [ "$old" != "$PREVIOUS" ] && [ -f "$old/commit" ]; then run_as_app rm -rf -- "$old"; fi
done
log "当前源码 [$NEW_REV]"
log '升级应用 [Utterlog] 成功 [TASK-END]'

if [ "$RUNTIME_REQUEST" -eq 0 ]; then
  printf 'Utterlog updated successfully.\n'
fi
