#!/usr/bin/env bash
# Prepare an existing PostgreSQL instance for Utterlog.
set -euo pipefail

PG_HOST=127.0.0.1
PG_PORT=5432
PG_SUPER=postgres
PG_SUPERPASS=
DB_NAME=utterlog
DB_USER=utterlog
DB_PASS=

usage() {
  cat <<'EOF'
Usage: bash scripts/setup-pgvector.sh [options]

  --host HOST          PostgreSQL host (default: 127.0.0.1)
  --port PORT          PostgreSQL port (default: 5432)
  --superuser USER     Administrative role (default: postgres)
  --superpass PASS     Administrative role password
  --db NAME            Utterlog database (default: utterlog)
  --user USER          Utterlog role (default: utterlog)
  --pass PASS          Utterlog role password
  -h, --help           Show this help

The PostgreSQL server must already provide the pgvector extension files.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --host) PG_HOST="${2:?missing --host value}"; shift 2 ;;
    --port) PG_PORT="${2:?missing --port value}"; shift 2 ;;
    --superuser) PG_SUPER="${2:?missing --superuser value}"; shift 2 ;;
    --superpass) PG_SUPERPASS="${2:?missing --superpass value}"; shift 2 ;;
    --db) DB_NAME="${2:?missing --db value}"; shift 2 ;;
    --user) DB_USER="${2:?missing --user value}"; shift 2 ;;
    --pass) DB_PASS="${2:?missing --pass value}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

command -v psql >/dev/null 2>&1 || { echo 'psql is required (install postgresql-client).' >&2; exit 2; }
case "$PG_PORT" in (*[!0-9]*|'') echo "Invalid PostgreSQL port: $PG_PORT" >&2; exit 1 ;; esac
for identifier in "$PG_SUPER" "$DB_NAME" "$DB_USER"; do
  case "$identifier" in (*[!a-zA-Z0-9_]*|'') echo "Invalid PostgreSQL identifier: $identifier" >&2; exit 1 ;; esac
done
[ -n "$DB_PASS" ] || { echo '--pass is required.' >&2; exit 1; }

psql_exec() {
  local database="$1" sql="$2"
  PGPASSWORD="$PG_SUPERPASS" psql \
    -h "$PG_HOST" -p "$PG_PORT" -U "$PG_SUPER" -d "$database" \
    -v ON_ERROR_STOP=1 -tAc "$sql"
}

psql_exec postgres 'select 1' >/dev/null || { echo "Cannot connect to PostgreSQL at $PG_HOST:$PG_PORT." >&2; exit 2; }

if [ "$(psql_exec postgres "select 1 from pg_available_extensions where name='vector'" || true)" != 1 ]; then
  major="$(psql_exec postgres "show server_version_num" | awk '{printf "%d", $1/10000}')"
  echo "pgvector is not installed on the PostgreSQL server." >&2
  echo "On Debian/Ubuntu install: sudo apt install postgresql-${major}-pgvector" >&2
  exit 3
fi

if [ "$(psql_exec postgres "select 1 from pg_roles where rolname='${DB_USER}'" || true)" = 1 ]; then
  PGPASSWORD="$PG_SUPERPASS" psql \
    -h "$PG_HOST" -p "$PG_PORT" -U "$PG_SUPER" -d postgres \
    -v ON_ERROR_STOP=1 -v "db_password=$DB_PASS" >/dev/null <<SQL
alter role "$DB_USER" with login password :'db_password';
SQL
else
  PGPASSWORD="$PG_SUPERPASS" psql \
    -h "$PG_HOST" -p "$PG_PORT" -U "$PG_SUPER" -d postgres \
    -v ON_ERROR_STOP=1 -v "db_password=$DB_PASS" >/dev/null <<SQL
create role "$DB_USER" with login password :'db_password';
SQL
fi

if [ "$(psql_exec postgres "select 1 from pg_database where datname='${DB_NAME}'" || true)" != 1 ]; then
  psql_exec postgres "create database \"${DB_NAME}\" owner \"${DB_USER}\"" >/dev/null
fi
psql_exec "$DB_NAME" 'create extension if not exists vector' >/dev/null

printf 'PostgreSQL ready: %s@%s:%s/%s (pgvector enabled)\n' "$DB_USER" "$PG_HOST" "$PG_PORT" "$DB_NAME"
