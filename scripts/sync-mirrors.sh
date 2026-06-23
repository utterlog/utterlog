#!/usr/bin/env bash
# ============================================================
# sync-mirrors.sh — mirror upstream public images into
# registry.utterlog.io so utterlog installs in mainland China
# don't hang on Docker Hub.
#
# What it mirrors:
#   pgvector/pgvector:pg18  → utterlog/pgvector:pg18 + :<precise>
#   caddy:2-alpine          → utterlog/caddy:2-alpine + :<precise>
#   docker:27-cli           → utterlog/docker:27-cli (upgrade sidecar)
#
# The floating tag (pg18, 2-alpine) is what
# docker-compose.prod.yml references — it always points at the
# latest patch of the current major. The precise tag (e.g.
# pg18.1, 2.8.4-alpine) is also pushed for users
# who want to pin.
#
# Tool: skopeo — preserves the full multi-arch manifest list
# (amd64 + arm64) in a single registry-to-registry copy without
# downloading blobs locally. It also short-circuits on blobs that
# already exist at the destination, so daily cron runs are cheap
# when upstream hasn't changed.
#
# Runs on the registry host (47.86.232.208) where the
# `utterlog-registry` container listens on 127.0.0.1:5000 and
# nginx terminates TLS for registry.utterlog.io in front of it.
# We push to 127.0.0.1:5000 directly (--dest-tls-verify=false)
# so we bypass nginx's htpasswd gate — push auth is intentionally
# only required from the public side.
#
# Cron: 0 3 * * *  /opt/utterlog/sync-mirrors.sh >> /var/log/utterlog-sync.log 2>&1
# ============================================================
set -euo pipefail

NAMESPACE="utterlog"
LOCAL_REG="127.0.0.1:5000"
PUBLIC_REG="registry.utterlog.io"

ts()  { date "+%Y-%m-%d %H:%M:%S"; }
log() { printf "[%s] %s\n" "$(ts)" "$*"; }

# Resolve the precise version a floating tag points at. Reads metadata
# straight from the upstream manifest via skopeo (no docker pull).
# Returns empty if we can't pin one down (then we only push the
# floating tag).
precise_tag_for() {
  local upstream="$1" floating="$2" precise="" raw=""
  raw=$(skopeo inspect "docker://${upstream}:${floating}" 2>/dev/null) || return 0
  case "$upstream" in
    pgvector/pgvector)
      # Image has no OCI labels — parse PG_VERSION from .Env.
      # PG_VERSION=18.4-1.pgdg12+1  →  pg18.4
      precise=$(printf '%s' "$raw" \
                | jq -r '.Env[] | select(startswith("PG_VERSION="))' \
                | sed 's/^PG_VERSION=//' \
                | awk -F'[.\\-]' '/^[0-9]/{print "pg"$1"."$2; exit}')
      ;;
    caddy)
      # Caddy's OCI label is "v2.11.3" — strip the v so the tag is
      # parallel to the Docker Hub scheme (`2.11.3-alpine`).
      precise=$(printf '%s' "$raw" \
                | jq -r '.Labels["org.opencontainers.image.version"] // empty' \
                | sed 's/^v//')
      [ -n "$precise" ] && precise="${precise}-alpine"
      ;;
    docker)
      # `docker:27-cli` is already a precise tag from upstream (major
      # 27 + cli variant). No useful "more precise" tag exists, so leave
      # the precise output empty — only the floating :27-cli tag will
      # be pushed.
      precise=""
      ;;
  esac
  if [ -n "$precise" ] && [ "$precise" != "$floating" ]; then
    echo "$precise"
  fi
}

# Manifest digest at the destination, or empty if absent.
# `set -e` + `set -o pipefail` would otherwise abort when skopeo
# returns non-zero on the (legitimate) 404 first-mirror case —
# we capture+test instead so absence becomes empty string.
remote_digest() {
  local name="$1" tag="$2" raw=""
  raw=$(skopeo inspect --raw "docker://${PUBLIC_REG}/${NAMESPACE}/${name}:${tag}" 2>/dev/null) || return 0
  [ -n "$raw" ] || return 0
  printf '%s' "$raw" | sha256sum | awk '{print "sha256:"$1}'
}

upstream_digest() {
  local raw=""
  raw=$(skopeo inspect --raw "docker://$1" 2>/dev/null) || return 0
  [ -n "$raw" ] || return 0
  printf '%s' "$raw" | sha256sum | awk '{print "sha256:"$1}'
}

# Args: <upstream> <floating> <local_name>
mirror() {
  local upstream="$1" floating="$2" local_name="$3"
  log "→ ${upstream}:${floating}"

  local up_dig cur_dig
  up_dig=$(upstream_digest "${upstream}:${floating}")
  cur_dig=$(remote_digest "$local_name" "$floating")
  log "  upstream=${up_dig:-?}  mirror=${cur_dig:-<absent>}"

  if [ -n "$cur_dig" ] && [ -n "$up_dig" ] && [ "$cur_dig" = "$up_dig" ]; then
    log "  already current — skipping"
    return 0
  fi

  log "  copying multi-arch → ${LOCAL_REG}/${NAMESPACE}/${local_name}:${floating}"
  skopeo copy --all --quiet \
    --dest-tls-verify=false \
    "docker://${upstream}:${floating}" \
    "docker://${LOCAL_REG}/${NAMESPACE}/${local_name}:${floating}"

  local precise
  precise=$(precise_tag_for "$upstream" "$floating" || true)
  if [ -n "$precise" ]; then
    log "  also tagging as :${precise}"
    skopeo copy --all --quiet \
      --dest-tls-verify=false \
      "docker://${upstream}:${floating}" \
      "docker://${LOCAL_REG}/${NAMESPACE}/${local_name}:${precise}"
  fi
  log "  done"
}

log "===== sync-mirrors start ====="

mirror "pgvector/pgvector" "pg18"     "pgvector"
mirror "caddy"             "2-alpine" "caddy"
mirror "docker"            "27-cli"   "docker"

log "===== sync-mirrors done ====="
