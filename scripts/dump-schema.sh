#!/usr/bin/env bash
# Export the current PostgreSQL schema used for fresh installations.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${UTTERLOG_ENV_FILE:-$ROOT/.env}"
SCHEMA_FILE="$ROOT/app/start/assets/schema.sql"

env_value() {
  local key="$1" fallback="$2" value=""
  if [ -f "$ENV_FILE" ]; then
    value="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r' | sed 's/^['\"'\'']\|['\"'\'']$//g')"
  fi
  printf '%s' "${value:-$fallback}"
}

DB_HOST="${DB_HOST:-$(env_value DB_HOST 127.0.0.1)}"
DB_PORT="${DB_PORT:-$(env_value DB_PORT 5432)}"
DB_NAME="${DB_NAME:-$(env_value DB_NAME utterlog)}"
DB_USER="${DB_USER:-$(env_value DB_USER utterlog)}"
DB_PASSWORD="${DB_PASSWORD:-$(env_value DB_PASSWORD '')}"

command -v pg_dump >/dev/null 2>&1 || { echo 'pg_dump is required (install postgresql-client).' >&2; exit 2; }
tmp_schema="$(mktemp "${TMPDIR:-/tmp}/utterlog-schema.XXXXXX")"
trap 'rm -f "$tmp_schema"' EXIT

echo "Dumping schema from $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME ..."
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --schema-only --no-owner --no-acl --no-privileges --if-exists --clean \
  > "$tmp_schema"
mv "$tmp_schema" "$SCHEMA_FILE"
trap - EXIT

lines="$(wc -l < "$SCHEMA_FILE" | tr -d ' ')"
printf 'Schema written to %s (%s lines)\n' "$SCHEMA_FILE" "$lines"
