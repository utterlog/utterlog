#!/usr/bin/env bash
set -Eeuo pipefail

project="$(cd "$(dirname "$0")/.." && pwd)"
repo="${UTTERLOG_TEST_REPOSITORY:-$project}"
legacy_tag="${UTTERLOG_TEST_LEGACY_TAG:-v1.6.0}"
[ "${DB_NAME:-}" = utterlog_upgrade_test ] || { echo 'Use a disposable utterlog_upgrade_test database.' >&2; exit 2; }
scratch="$(mktemp -d)"
export UPDATE_TEST_ROOT="$scratch/site"
export UPDATE_TEST_PORT="$(bash "$project/scripts/find-free-port.sh" 19320 40)"
export UPDATE_TEST_BUN="$(command -v bun)"
export UPDATE_TEST_CURL="$(command -v curl)"
export UPDATE_TEST_LEGACY="$(git -C "$repo" rev-list -1 "$legacy_tag")"
export UPDATE_TEST_LOG="$scratch/server.log"

cleanup() {
  local result=$?
  if [ -f "$UPDATE_TEST_ROOT/.runtime/test.pid" ]; then
    kill "$(cat "$UPDATE_TEST_ROOT/.runtime/test.pid")" 2>/dev/null || true
  fi
  if [ "$result" -ne 0 ]; then tail -n 60 "$UPDATE_TEST_LOG" 2>/dev/null || true; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT

git clone --quiet --no-hardlinks "$repo" "$scratch/origin"
candidate="$(git -C "$scratch/origin" rev-parse HEAD)"
git -C "$scratch/origin" tag v99.0.0 "$candidate"
git clone --quiet --branch "$legacy_tag" "$scratch/origin" "$UPDATE_TEST_ROOT"
mkdir -p "$scratch/bin" "$UPDATE_TEST_ROOT/.runtime" "$UPDATE_TEST_ROOT/uploads"

# Use real Bun processes, with a local replacement for systemd in CI.
cat > "$scratch/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$UPDATE_TEST_ROOT"
case "$1" in
  stop)
    if [ -f .runtime/test.pid ]; then
      pid="$(cat .runtime/test.pid)"
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 1 50); do
        if ! "$UPDATE_TEST_CURL" --max-time 1 -fs "http://127.0.0.1:$UPDATE_TEST_PORT/api/v1/install/status" >/dev/null; then break; fi
        sleep 0.1
      done
      rm .runtime/test.pid
    fi
    ;;
  start)
    "$UPDATE_TEST_BUN" run start >> "$UPDATE_TEST_LOG" 2>&1 </dev/null &
    printf '%s\n' "$!" > .runtime/test.pid
    for _ in $(seq 1 50); do
      if "$UPDATE_TEST_CURL" --max-time 1 -fs "http://127.0.0.1:$UPDATE_TEST_PORT/api/v1/install/status" >/dev/null; then exit 0; fi
      sleep 0.2
    done
    exit 1
    ;;
  *) exit 2 ;;
esac
EOF
cat > "$scratch/bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ -f "$UPDATE_TEST_ROOT/.runtime/reject-health" ] && [[ "${!#}" == */api/v1/health ]]; then exit 22; fi
exec "$UPDATE_TEST_CURL" "$@"
EOF
printf '%s\n' '#!/usr/bin/env bash' 'exec "$@"' > "$scratch/bin/sudo"
if ! command -v flock >/dev/null 2>&1; then
  # The single updater runs sequentially on macOS, where util-linux is absent.
  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$scratch/bin/flock"
fi
chmod +x "$scratch/bin/"*

PGPASSWORD="$DB_PASSWORD" psql -X -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -f "$project/app/start/assets/schema.sql" > "$scratch/schema.log"
PGPASSWORD="$DB_PASSWORD" psql -X -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -c "insert into ul_users (username, email, password, role) values ('upgrade-test', 'upgrade@example.test', 'test', 'admin')" \
  -c "insert into ul_options(name,value) values ('install_completed','1')" > "$scratch/seed.log"

cd "$UPDATE_TEST_ROOT"
cat > .env <<EOF
PORT=$UPDATE_TEST_PORT
APP_URL=http://127.0.0.1:$UPDATE_TEST_PORT
JWT_SECRET=isolated-upgrade-test-key
EOF
printf '%s\n' 'original uploaded file' > uploads/sentinel.txt

if [ -n "${UTTERLOG_TEST_LEGACY_BUILD:-}" ]; then
  for path in node_modules app/start/node_modules app/admin/node_modules app/start/dist app/admin/dist; do
    cp -R "$UTTERLOG_TEST_LEGACY_BUILD/$path" "$path"
  done
else
  bun install --frozen-lockfile > "$scratch/old-build.log" 2>&1
  bun run build >> "$scratch/old-build.log" 2>&1
fi

export PATH="$scratch/bin:$PATH"
export UTTERLOG_INSTALL_DIR="$UPDATE_TEST_ROOT"
export UTTERLOG_BUN_BIN="$UPDATE_TEST_BUN"
export UTTERLOG_UPDATE_TAG=v99.0.0
export UTTERLOG_HEALTH_ATTEMPTS=1
export UTTERLOG_SERVICE_USER="$(id -un)"
url="http://127.0.0.1:$UPDATE_TEST_PORT"
systemctl start
bash "$project/scripts/check-host.sh" "$url" "$UPDATE_TEST_BUN"

touch .runtime/reject-health
if bash "$project/scripts/update-bun.sh"; then echo 'Expected health check failure.' >&2; exit 1; fi
[ "$(git rev-parse HEAD)" = "$UPDATE_TEST_LEGACY" ]
bash "$project/scripts/check-host.sh" "$url" "$UPDATE_TEST_BUN"
grep -q '上一版本已恢复' uploads/upgrade.log
rm .runtime/reject-health

bash "$project/scripts/update-bun.sh"
bash "$project/scripts/check-host.sh" "$url" "$UPDATE_TEST_BUN" "$candidate"
[ "$(git rev-parse HEAD)" = "$candidate" ]
[ "$(cat uploads/sentinel.txt)" = 'original uploaded file' ]
PGPASSWORD="$DB_PASSWORD" psql -X -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -tAc "select username from ul_users where role = 'admin'" | grep -Fx upgrade-test
echo 'Released version rollback and upgrade verified.'
