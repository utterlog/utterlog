#!/usr/bin/env bash
# ============================================================
# Dump current database schema to app/server/assets/schema.sql
# Used to commit a fresh-install schema to the repo.
# Run this from the project root while Docker is up.
# ============================================================

set -e

SCHEMA_FILE="app/server/assets/schema.sql"

# Read DB config from docker-compose.yml or .env
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-utterlog}"
DB_USER="${DB_USER:-gentpan}"
DB_PASSWORD="${DB_PASSWORD:-utterlog}"

echo "Dumping schema from $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME ..."

docker compose exec -T postgres pg_dump \
    -U "$DB_USER" -d "$DB_NAME" \
    --schema-only \
    --no-owner \
    --no-acl \
    --no-privileges \
    --if-exists \
    --clean > "$SCHEMA_FILE"

LINES=$(wc -l < "$SCHEMA_FILE")
echo ""
echo "✓ Schema written to $SCHEMA_FILE ($LINES lines)"
echo ""
echo "Next steps:"
echo "  1. Review $SCHEMA_FILE"
echo "  2. git add $SCHEMA_FILE && git commit -m 'chore: update schema'"
echo "  3. Fresh installs will auto-load this schema on first Bun app start."
