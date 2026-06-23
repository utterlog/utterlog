#!/usr/bin/env bash
# ============================================================
# detect-services.sh — find existing PostgreSQL on this host
# ------------------------------------------------------------
# Output: a single eval-able shell snippet on stdout. Sourcing it
# defines:
#   PG_DETECTED=0|1
#   PG_HOST=...           # 127.0.0.1 (always, since we only check loopback)
#   PG_PORT=...           # 5432 by default
#   PG_CONTAINER=...      # docker container name if found via docker, else empty
#   PG_IMAGE=...          # docker image label if found, else empty
#   PG_FLAVOR=alpine|debian|other  # used by setup-pgvector.sh to pick installer
#
# Why a sourceable snippet instead of JSON: install.sh is bash and
# adding `jq` as a dependency just for a few strings
# is overkill. `eval "$(bash detect-services.sh)"` reads cleanly.
# ============================================================
set -u

PG_PORT="${PG_PORT:-5432}"

# Probe a TCP port without requiring `nc` — bash builtins work on
# every distro that has bash. /dev/tcp is special: writing to it
# attempts a connect with whatever default timeout the kernel uses,
# which is sometimes too long. We wrap with a 2s timeout via the
# `timeout` command if it's available, falling back to bare bash.
probe_port() {
  local host="$1" port="$2"
  if command -v timeout >/dev/null 2>&1; then
    timeout 2 bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null
  else
    (exec 3<>"/dev/tcp/$host/$port") 2>/dev/null
  fi
}

# Find a docker container that exposes the given host port. Returns
# the container name on stdout, or empty string. Skips utterlog's
# own containers — we don't want to "detect" the bundled postgres
# from a previous install and recommend reusing it as if it were a
# foreign service.
find_container_by_port() {
  local port="$1"
  command -v docker >/dev/null 2>&1 || { echo ""; return; }
  # docker ps --format includes the port mapping. Filter on host
  # port match. The port column looks like "127.0.0.1:5432->5432/tcp"
  # so a substring match on ":<port>->" is reliable.
  docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}' 2>/dev/null \
    | awk -F'|' -v port=":$port->" -v skip='utterlog-' '
        index($3, port) > 0 && index($1, skip) != 1 { print $1 "|" $2; exit }
      '
}

# Identify the OS flavor of a postgres image so the pgvector
# installer knows whether to use apk (Alpine) or apt (Debian).
flavor_of() {
  local image="$1"
  # The official postgres + pgvector tags follow a convention:
  #   postgres:18-alpine, postgres:18.3-alpine          → alpine
  #   postgres:18, postgres:18.3-bookworm                → debian
  #   pgvector/pgvector:pg18                              → debian (bookworm)
  case "$image" in
    *alpine*) echo "alpine" ;;
    postgres:*) echo "debian" ;;
    pgvector/pgvector:*) echo "debian" ;;
    *) echo "other" ;;
  esac
}

# ============================================================
# PostgreSQL
# ============================================================
PG_DETECTED=0
PG_CONTAINER=""
PG_IMAGE=""
PG_FLAVOR="other"
if probe_port 127.0.0.1 "$PG_PORT"; then
  PG_DETECTED=1
  hit=$(find_container_by_port "$PG_PORT" || true)
  if [ -n "$hit" ]; then
    PG_CONTAINER="${hit%%|*}"
    PG_IMAGE="${hit##*|}"
    PG_FLAVOR=$(flavor_of "$PG_IMAGE")
  fi
fi

# ============================================================
# Emit eval-able snippet
# ============================================================
printf 'PG_DETECTED=%s\n' "$PG_DETECTED"
printf 'PG_HOST=%s\n' "127.0.0.1"
printf 'PG_PORT=%s\n' "$PG_PORT"
printf 'PG_CONTAINER=%q\n' "$PG_CONTAINER"
printf 'PG_IMAGE=%q\n' "$PG_IMAGE"
printf 'PG_FLAVOR=%q\n' "$PG_FLAVOR"
