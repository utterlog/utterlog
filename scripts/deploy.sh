#!/usr/bin/env bash
# Configure and deploy Utterlog directly on a Linux host with Bun + systemd.
set -Eeuo pipefail

BUILD=1
SETUP_DB=1
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    --skip-db-setup) SETUP_DB=0 ;;
    -h|--help)
      printf '%s\n' \
        'Usage: sudo bash scripts/deploy.sh [--no-build] [--skip-db-setup]' \
        '' \
        'Installs Bun host prerequisites, configures PostgreSQL and systemd, builds and starts Utterlog.'
      exit 0
      ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

if [ "$(uname -s)" != Linux ]; then
  printf 'Production deployment requires a Linux host with systemd. Use bun run dev on this machine.\n' >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || { printf 'Run this script as root.\n' >&2; exit 1; }
  exec sudo -E bash "$0" "$@"
fi

ROOT="${UTTERLOG_INSTALL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
APP_USER="${UTTERLOG_SERVICE_USER:-utterlog}"
APP_GROUP="${UTTERLOG_SERVICE_GROUP:-$APP_USER}"
SERVICE="${UTTERLOG_SERVICE:-utterlog-app}"
UPDATE_REQUEST_FILE="${UTTERLOG_UPDATE_REQUEST_FILE:-$ROOT/.runtime/update.request}"
ENV_FILE="$ROOT/.env"

log() { printf '==> %s\n' "$*"; }
ok() { printf 'OK: %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

install_base_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y ca-certificates curl git gnupg openssl rsync unzip postgresql-client >/dev/null
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl git openssl rsync unzip postgresql >/dev/null
  elif command -v yum >/dev/null 2>&1; then
    yum install -y ca-certificates curl git openssl rsync unzip postgresql >/dev/null
  else
    die 'Unsupported package manager. Install curl, git, openssl, rsync, unzip and the PostgreSQL client first.'
  fi
}

version_at_least() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]
}

ensure_bun() {
  BUN_BIN="$(command -v bun || true)"
  if [ -n "$BUN_BIN" ] && version_at_least "$($BUN_BIN --version)" 1.4.0; then
    return
  fi
  log 'Installing Bun 1.4+'
  export BUN_INSTALL=/opt/bun
  curl -fsSL https://bun.sh/install | bash >/dev/null
  [ -x /opt/bun/bin/bun ] || die 'Bun installation failed.'
  ln -sf /opt/bun/bin/bun /usr/local/bin/bun
  BUN_BIN=/opt/bun/bin/bun
}

env_get() {
  local key="$1" fallback="${2:-}" value=""
  if [ -n "${!key:-}" ]; then
    value="${!key}"
  elif [ -f "$ENV_FILE" ]; then
    value="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -1 | tr -d '\r')"
  fi
  printf '%s' "${value:-$fallback}"
}

env_set() {
  local key="$1" value="$2" escaped
  case "$value" in *$'\n'*|*$'\r'*) die "Invalid newline in $key" ;; esac
  escaped="${value//\\/\\\\}"
  escaped="${escaped//&/\\&}"
  escaped="${escaped//|/\\|}"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

APP_USER="$(env_get UTTERLOG_SERVICE_USER "$APP_USER")"
SERVICE="$(env_get UTTERLOG_SERVICE "$SERVICE")"
UPDATE_REQUEST_FILE="$(env_get UTTERLOG_UPDATE_REQUEST_FILE "$UPDATE_REQUEST_FILE")"
case "$ROOT" in (/*) ;; (*) die 'UTTERLOG_INSTALL_DIR must be an absolute path.' ;; esac
case "$ROOT" in (*[!a-zA-Z0-9_./-]*) die "Unsupported character in install path: $ROOT" ;; esac
case "$APP_USER" in (*[!a-zA-Z0-9_-]*|'') die "Invalid service user: $APP_USER" ;; esac
case "$SERVICE" in (*[!a-zA-Z0-9_.@-]*|'') die "Invalid service name: $SERVICE" ;; esac
case "$UPDATE_REQUEST_FILE" in (/*) ;; (*) die 'UTTERLOG_UPDATE_REQUEST_FILE must be an absolute path.' ;; esac
case "$UPDATE_REQUEST_FILE" in (*[!a-zA-Z0-9_./-]*) die "Unsupported character in update request path: $UPDATE_REQUEST_FILE" ;; esac

valid_ident() {
  [[ "$1" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]
}

install_local_postgres() {
  command -v apt-get >/dev/null 2>&1 || die 'Automatic PostgreSQL 18 installation currently supports Debian/Ubuntu. Configure an external PostgreSQL 18 + pgvector instance and rerun with --skip-db-setup.'
  local codename
  codename="$(. /etc/os-release && printf '%s' "${VERSION_CODENAME:-}")"
  [ -n "$codename" ] || die 'Cannot determine Debian/Ubuntu codename.'
  install -d -m 0755 /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  printf 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' "$codename" > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -y postgresql-18 postgresql-client-18 postgresql-18-pgvector >/dev/null
  systemctl enable --now postgresql
}

setup_database() {
  local db_host db_port db_name db_user db_password
  db_host="$(env_get DB_HOST 127.0.0.1)"
  db_port="$(env_get DB_PORT 5432)"
  db_name="$(env_get DB_NAME utterlog)"
  db_user="$(env_get DB_USER utterlog)"
  db_password="$(env_get DB_PASSWORD)"
  valid_ident "$db_name" || die "Invalid DB_NAME: $db_name"
  valid_ident "$db_user" || die "Invalid DB_USER: $db_user"
  [ -n "$db_password" ] || die 'DB_PASSWORD is empty.'

  if [ "$db_host" = 127.0.0.1 ] || [ "$db_host" = localhost ]; then
    if ! command -v pg_isready >/dev/null 2>&1 || ! pg_isready -h "$db_host" -p "$db_port" >/dev/null 2>&1; then
      log 'Installing local PostgreSQL 18 + pgvector'
      install_local_postgres
    fi
    id postgres >/dev/null 2>&1 || die 'Local PostgreSQL service user is missing.'
    if runuser -u postgres -- psql -tAc "select 1 from pg_roles where rolname='$db_user'" | grep -q 1; then
      runuser -u postgres -- psql -v ON_ERROR_STOP=1 -v "db_password=$db_password" >/dev/null <<SQL
alter role "$db_user" with login password :'db_password';
SQL
    else
      runuser -u postgres -- psql -v ON_ERROR_STOP=1 -v "db_password=$db_password" >/dev/null <<SQL
create role "$db_user" with login password :'db_password';
SQL
    fi
    if ! runuser -u postgres -- psql -tAc "select 1 from pg_database where datname='$db_name'" | grep -q 1; then
      runuser -u postgres -- createdb -O "$db_user" "$db_name"
    fi
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "$db_name" -c 'create extension if not exists vector' >/dev/null
  else
    PGPASSWORD="$db_password" psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -v ON_ERROR_STOP=1 -tAc 'select 1' >/dev/null \
      || die 'Cannot connect to the configured external PostgreSQL database.'
    PGPASSWORD="$db_password" psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -v ON_ERROR_STOP=1 -c 'create extension if not exists vector' >/dev/null \
      || die 'pgvector is unavailable or DB_USER cannot create the vector extension.'
  fi
  ok "PostgreSQL ready at $db_host:$db_port/$db_name"
}

render_unit() {
  local source="$1" target="$2" bun_bin="$3"
  sed \
    -e "s|__INSTALL_DIR__|$ROOT|g" \
    -e "s|__APP_USER__|$APP_USER|g" \
    -e "s|__APP_GROUP__|$APP_GROUP|g" \
    -e "s|__BUN_BIN__|$bun_bin|g" \
    -e "s|__SERVICE__|$SERVICE|g" \
    -e "s|__UPDATE_REQUEST_FILE__|$UPDATE_REQUEST_FILE|g" \
    "$source" > "$target"
}

run_as_app() {
  local bun_dir app_home
  bun_dir="$(dirname "$BUN_BIN")"
  app_home="$(getent passwd "$APP_USER" | cut -d: -f6)"
  runuser -u "$APP_USER" -- env HOME="$app_home" PATH="$bun_dir:/usr/local/bin:/usr/bin:/bin" "$@"
}

log 'Installing host prerequisites'
install_base_packages
ensure_bun
ok "Bun $($BUN_BIN --version)"

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin "$APP_USER"
fi
APP_GROUP="$(id -gn "$APP_USER")"

ENV_CREATED=0
if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT/.env.example" "$ENV_FILE"
  ENV_CREATED=1
fi
env_set HOST "$(env_get HOST 127.0.0.1)"
if [ "$ENV_CREATED" -eq 1 ] || ! grep -q '^PORT=' "$ENV_FILE" || [ -z "$(env_get PORT)" ]; then
  env_set PORT "$(bash "$ROOT/scripts/find-free-port.sh" 9260 50)"
fi
env_set DB_HOST "$(env_get DB_HOST 127.0.0.1)"
env_set DB_PORT "$(env_get DB_PORT 5432)"
env_set DB_NAME "$(env_get DB_NAME utterlog)"
env_set DB_USER "$(env_get DB_USER utterlog)"
DB_PASSWORD_VALUE="$(env_get DB_PASSWORD)"
[ -n "$DB_PASSWORD_VALUE" ] || DB_PASSWORD_VALUE="$(openssl rand -hex 24)"
env_set DB_PASSWORD "$DB_PASSWORD_VALUE"
JWT_SECRET_VALUE="$(env_get JWT_SECRET)"
[ -n "$JWT_SECRET_VALUE" ] || JWT_SECRET_VALUE="$(openssl rand -hex 48)"
env_set JWT_SECRET "$JWT_SECRET_VALUE"
if [ -n "${DOMAIN:-}" ]; then
  env_set APP_URL "https://${DOMAIN}"
  env_set REQUIRE_PUBLIC_APP_URL true
else
  env_set APP_URL "$(env_get APP_URL "http://127.0.0.1:$(env_get PORT 9260)")"
fi
env_set UTTERLOG_INSTALL_DIR "$ROOT"
env_set UTTERLOG_SERVICE "$SERVICE"
env_set UTTERLOG_SERVICE_USER "$APP_USER"
env_set UTTERLOG_UPDATE_PATH_UNIT utterlog-update.path
env_set UTTERLOG_UPDATE_REQUEST_FILE "$UPDATE_REQUEST_FILE"

mkdir -p "$ROOT/uploads" "$ROOT/content/themes" "$ROOT/content/plugins" "$ROOT/backup" "$ROOT/.runtime"
chown -R "$APP_USER:$APP_GROUP" "$ROOT"
chmod 600 "$ENV_FILE"

if [ "$SETUP_DB" -eq 1 ]; then
  setup_database
fi

if [ "$BUILD" -eq 1 ]; then
  log 'Installing dependencies and verifying the Bun build'
  run_as_app "$BUN_BIN" install --frozen-lockfile
  run_as_app "$BUN_BIN" run verify
fi

log 'Installing systemd units'
render_unit "$ROOT/deploy/systemd/utterlog-app.service" "/etc/systemd/system/${SERVICE}.service" "$BUN_BIN"
render_unit "$ROOT/deploy/systemd/utterlog-update.path" /etc/systemd/system/utterlog-update.path "$BUN_BIN"
render_unit "$ROOT/deploy/systemd/utterlog-update.service" /etc/systemd/system/utterlog-update.service "$BUN_BIN"
systemctl daemon-reload
systemctl enable --now utterlog-update.path
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

PORT_VALUE="$(env_get PORT 9260)"
log "Waiting for http://127.0.0.1:${PORT_VALUE}/api/v1/install/status"
for attempt in $(seq 1 60); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${PORT_VALUE}/api/v1/install/status" >/dev/null 2>&1; then
    ok "Utterlog is running on 127.0.0.1:${PORT_VALUE}"
    printf 'Logs: journalctl -u %s -f\n' "$SERVICE"
    exit 0
  fi
  [ "$attempt" -lt 60 ] && sleep 2
done

systemctl status "$SERVICE" --no-pager || true
die "Health check failed. Inspect: journalctl -u $SERVICE -n 100"
