#!/usr/bin/env bash
# ============================================================
# Utterlog — one-liner installer (pull-only, no source checkout)
#
# Usage:
#   curl -fsSL https://utterlog.io/install.sh | bash
#
# What it does:
#   1. Verify Docker + compose plugin
#   2. Create ./utterlog/ and download 2 files:
#      - docker-compose.yml  (pull-only, direct from registry)
#      - .env.example
#   3. Generate .env with random DB_PASSWORD (16 chars) + JWT_SECRET (48)
#   4. Probe app image source, then docker compose pull
#   5. docker compose up -d  ← starts services
#
# No git clone. No source download. No local compilation.
# Happy-path finishes in ~30 seconds on a fresh server.
#
# Env overrides:
#   UTTERLOG_DIR=/opt/utterlog             # install path
#   UTTERLOG_IMAGE_PREFIX=ghcr.io/utterlog # pin image registry
#   UTTERLOG_IMAGE_TAG=sha-xxxxxxx         # pin to a specific build
#   UTTERLOG_PORT=9260                     # bind port (127.0.0.1 only)
#   UTTERLOG_DOCKER_MIRROR=https://...     # Docker Hub registry mirror
#   UTTERLOG_PULL_TIMEOUT=900              # seconds before a pull is considered stuck
#   UTTERLOG_DOCKERHUB_PREFIX=mirror.example.com
#                                           # optional prefix for postgres image
# ============================================================
set -euo pipefail

INSTALL_DIR="${UTTERLOG_DIR:-$(pwd)/utterlog}"
BASE_URL="${UTTERLOG_BASE_URL:-https://utterlog.io}"
PULL_TIMEOUT="${UTTERLOG_PULL_TIMEOUT:-900}"
DOCKER_REGISTRY_MIRROR="${UTTERLOG_DOCKER_MIRROR:-https://registry.cn-hangzhou.aliyuncs.com}"

# -------- Color helpers --------
if [ -t 1 ]; then
  C_BLUE=$'\e[34m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'
  C_RED=$'\e[31m'; C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'; C_RESET=$'\e[0m'
else
  C_BLUE=; C_GREEN=; C_YELLOW=; C_RED=; C_BOLD=; C_DIM=; C_RESET=
fi
log()  { printf "%s==>%s %s\n" "$C_BLUE$C_BOLD" "$C_RESET" "$*"; }
ok()   { printf "%s✓%s %s\n" "$C_GREEN$C_BOLD" "$C_RESET" "$*"; }
warn() { printf "%s!%s %s\n" "$C_YELLOW$C_BOLD" "$C_RESET" "$*"; }
err()  { printf "%s✗%s %s\n" "$C_RED$C_BOLD" "$C_RESET" "$*" >&2; }

have_timeout() { command -v timeout >/dev/null 2>&1; }
run_with_timeout() {
  local seconds="$1"
  shift
  if have_timeout; then
    timeout "$seconds" "$@"
  else
    "$@"
  fi
}
configure_docker_mirror() {
  [ "$(id -u)" -eq 0 ] || return 0
  [ -n "$DOCKER_REGISTRY_MIRROR" ] || return 0

  mkdir -p /etc/docker
  if [ ! -s /etc/docker/daemon.json ]; then
    cat >/etc/docker/daemon.json <<JSON
{
  "registry-mirrors": ["$DOCKER_REGISTRY_MIRROR"]
}
JSON
    systemctl restart docker >/dev/null 2>&1 || service docker restart >/dev/null 2>&1 || true
    ok "Docker Hub mirror configured: $DOCKER_REGISTRY_MIRROR"
    return 0
  fi

  if grep -q '"registry-mirrors"' /etc/docker/daemon.json; then
    ok "Docker Hub mirror already configured"
    return 0
  fi

  warn "/etc/docker/daemon.json already exists; leaving it unchanged to avoid overwriting custom Docker settings."
  warn "For faster Docker Hub pulls, add registry-mirrors: $DOCKER_REGISTRY_MIRROR"
}

cat <<BANNER

${C_BOLD}  Utterlog — one-liner installer${C_RESET}
  ${C_BOLD}═══════════════════════════════════════${C_RESET}
  ${C_DIM}Docs:     https://docs.utterlog.io${C_RESET}
  ${C_DIM}Registry: auto (${UTTERLOG_IMAGE_PREFIX:-registry.utterlog.io/utterlog → ghcr.io/utterlog})${C_RESET}

BANNER

# -------- 1. Docker sanity --------
if ! command -v docker >/dev/null 2>&1; then
  warn "Docker is not installed."
  if [ "$(id -u)" -ne 0 ]; then
    err "Please install Docker first, or rerun this installer as root."
    echo "  Recommended:  curl -fsSL https://utterlog.io/install.sh | sudo bash"
    exit 1
  fi

  log "Installing Docker via Docker's official script with Aliyun mirror ..."
  curl -fsSL https://get.docker.com | sh -s -- --mirror Aliyun
fi
configure_docker_mirror
if ! docker compose version >/dev/null 2>&1; then
  err "docker compose plugin is not installed."
  echo "  Debian/Ubuntu:  sudo apt install -y docker-compose-plugin"
  echo "  RHEL/CentOS:    sudo yum install -y docker-compose-plugin"
  exit 1
fi
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# -------- 2. Prepare install dir --------
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
log "Install dir: $(pwd)"

# -------- 3. Fetch compose + env template --------
log "Downloading docker-compose.yml and .env.example from $BASE_URL ..."
curl -fsSL "$BASE_URL/docker-compose.yml" -o docker-compose.yml
curl -fsSL "$BASE_URL/.env.example" -o .env.example
ok "Compose files ready ($(wc -c < docker-compose.yml) bytes)"

# -------- 4. Generate .env with random secrets --------
rand_str() {
  local len="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$len"
  else
    LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$len"
  fi
  echo
}

env_value() {
  local key="$1"
  [ -f .env ] || return 0
  awk -F= -v k="$key" '$1 == k {sub(/^[^=]*=/, ""); print; exit}' .env
}

persist_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
  rm -f .env.bak
}

image_source_has_tag() {
  local prefix="$1"
  local tag="${UTTERLOG_IMAGE_TAG:-$(env_value UTTERLOG_IMAGE_TAG)}"
  tag="${tag:-latest}"
  run_with_timeout 20 docker manifest inspect "$prefix/utterlog-app:$tag" >/dev/null 2>&1
}

select_image_source() {
  local configured="${UTTERLOG_IMAGE_PREFIX:-$(env_value UTTERLOG_IMAGE_PREFIX)}"
  configured="${configured%/}"
  if [ -n "$configured" ]; then
    export UTTERLOG_IMAGE_PREFIX="$configured"
    persist_env UTTERLOG_IMAGE_PREFIX "$configured"
    log "Using configured Utterlog image source: $configured"
    return 0
  fi

  log "Checking Utterlog image source registry.utterlog.io ..."
  if image_source_has_tag "registry.utterlog.io/utterlog"; then
    export UTTERLOG_IMAGE_PREFIX="registry.utterlog.io/utterlog"
    persist_env UTTERLOG_IMAGE_PREFIX "$UTTERLOG_IMAGE_PREFIX"
    ok "Using Utterlog image source: $UTTERLOG_IMAGE_PREFIX"
    return 0
  fi

  warn "registry.utterlog.io is not readable for this tag; using GHCR."
  export UTTERLOG_IMAGE_PREFIX="ghcr.io/utterlog"
  persist_env UTTERLOG_IMAGE_PREFIX "$UTTERLOG_IMAGE_PREFIX"
  if ! image_source_has_tag "$UTTERLOG_IMAGE_PREFIX"; then
    warn "GHCR manifest probe failed too; docker compose pull will still try GHCR and show the real error."
  fi
  ok "Using Utterlog image source: $UTTERLOG_IMAGE_PREFIX"
}

if [ ! -f .env ]; then
  DB_PASS=$(rand_str 16)
  JWT=$(rand_str 48)
  cp .env.example .env
  # Replace empty DB_PASSWORD= / JWT_SECRET= with generated values
  sed -i.bak "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASS|" .env
  sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" .env
  # Write install dir for future update tooling.
  grep -q '^UTTERLOG_INSTALL_DIR=' .env \
    || echo "UTTERLOG_INSTALL_DIR=$INSTALL_DIR" >> .env
  # Apply registry override if user set one. Otherwise select_image_source()
  # below writes the fastest readable app source before docker compose pull.
  if [ -n "${UTTERLOG_IMAGE_PREFIX:-}" ]; then
    grep -q '^UTTERLOG_IMAGE_PREFIX=' .env \
      && sed -i.bak "s|^UTTERLOG_IMAGE_PREFIX=.*|UTTERLOG_IMAGE_PREFIX=$UTTERLOG_IMAGE_PREFIX|" .env \
      || echo "UTTERLOG_IMAGE_PREFIX=$UTTERLOG_IMAGE_PREFIX" >> .env
  fi
  if [ -n "${UTTERLOG_DOCKERHUB_PREFIX:-}" ]; then
    HUB_PREFIX="${UTTERLOG_DOCKERHUB_PREFIX%/}"
    grep -q '^POSTGRES_IMAGE=' .env \
      && sed -i.bak "s|^POSTGRES_IMAGE=.*|POSTGRES_IMAGE=$HUB_PREFIX/pgvector/pgvector:pg18|" .env \
      || echo "POSTGRES_IMAGE=$HUB_PREFIX/pgvector/pgvector:pg18" >> .env
  fi
  rm -f .env.bak
  ok ".env created with random credentials"
else
  warn ".env already exists — keeping your configured values"
fi

# -------- 5. Pull prebuilt images --------
select_image_source

log "Pulling base image (postgres), timeout ${PULL_TIMEOUT}s ..."
if ! run_with_timeout "$PULL_TIMEOUT" docker compose pull postgres 2>&1; then
  err "Failed to pull postgres image."
  echo "  Default images come from Docker Hub via Docker mirror: $DOCKER_REGISTRY_MIRROR"
  echo "  If your host requires a private mirror, set UTTERLOG_DOCKER_MIRROR or UTTERLOG_DOCKERHUB_PREFIX."
  exit 1
fi

log "Pulling Utterlog app image from ${UTTERLOG_IMAGE_PREFIX}, timeout ${PULL_TIMEOUT}s ..."
if ! run_with_timeout "$PULL_TIMEOUT" docker compose pull app 2>&1; then
  warn "${UTTERLOG_IMAGE_PREFIX} pull failed; retrying with GHCR fallback ..."
  export UTTERLOG_IMAGE_PREFIX="ghcr.io/utterlog"
  persist_env UTTERLOG_IMAGE_PREFIX "$UTTERLOG_IMAGE_PREFIX"
  if ! run_with_timeout "$PULL_TIMEOUT" docker compose pull app 2>&1; then
    err "Failed to pull Utterlog images from both registry.utterlog.io and ghcr.io."
    exit 1
  fi
fi
ok "Images pulled"

# -------- 6. Start --------
log "Starting services..."
docker compose up -d

# Wait for app to come up
log "Waiting for Bun app to become healthy..."
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${UTTERLOG_PORT:-9260}/api/v1/install/status" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

PORT="${UTTERLOG_PORT:-9260}"
cat <<DONE

  ${C_GREEN}${C_BOLD}✓ Utterlog is running${C_RESET}

  Local:     ${C_BOLD}http://127.0.0.1:$PORT${C_RESET}
  Next step: open ${C_BOLD}http://127.0.0.1:$PORT/install${C_RESET} in your browser
             to create the admin account.

  ${C_DIM}- Install dir:  $INSTALL_DIR${C_RESET}
  ${C_DIM}- Credentials:  $INSTALL_DIR/.env  (keep this file safe)${C_RESET}
  ${C_DIM}- Logs:         docker compose -f $INSTALL_DIR/docker-compose.yml logs -f${C_RESET}
  ${C_DIM}- Upgrade:      admin → 版本 → 一键升级${C_RESET}
  ${C_DIM}                or: curl -fsSL https://utterlog.io/update.sh | bash${C_RESET}

  Point your nginx / caddy reverse proxy at 127.0.0.1:$PORT to expose
  Utterlog on a public domain. See docs.utterlog.io/install for examples.

DONE
