#!/usr/bin/env bash
# Utterlog one-line host installer: Git checkout + Bun/systemd deployment.
set -Eeuo pipefail

REPO_URL="${UTTERLOG_REPO:-https://github.com/utterlog/utterlog.git}"
INSTALL_DIR="${UTTERLOG_DIR:-/opt/utterlog}"
DEFAULT_REF=main
REF="${UTTERLOG_REF:-$DEFAULT_REF}"

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      printf '%s\n' \
        'Usage: curl -fsSL https://github.com/utterlog/utterlog/releases/latest/download/install.sh | sudo bash' \
        '' \
        'Environment: UTTERLOG_DIR, UTTERLOG_REPO, UTTERLOG_REF, DOMAIN, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.'
      exit 0
      ;;
  esac
done

if [ "$(uname -s)" != Linux ]; then
  printf 'Utterlog production installation requires Linux with systemd.\n' >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || { printf 'Run this installer as root.\n' >&2; exit 1; }
  exec sudo -E bash "$0" "$@"
fi

install_git() {
  command -v git >/dev/null 2>&1 && return
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y ca-certificates curl git >/dev/null
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl git >/dev/null
  elif command -v yum >/dev/null 2>&1; then
    yum install -y ca-certificates curl git >/dev/null
  else
    printf 'Install Git, then rerun this installer.\n' >&2
    exit 1
  fi
}

install_git

if [ -d "$INSTALL_DIR/.git" ]; then
  printf 'An installation already exists. Run sudo bash "%s/scripts/update-bun.sh".\n' "$INSTALL_DIR"
  exit 1
elif [ -e "$INSTALL_DIR" ]; then
  printf 'Install path exists but is not a Git checkout: %s\n' "$INSTALL_DIR" >&2
  exit 1
else
  printf '==> Cloning Utterlog into %s\n' "$INSTALL_DIR"
  git clone --depth 1 --branch "$REF" -- "$REPO_URL" "$INSTALL_DIR"
fi

export UTTERLOG_INSTALL_DIR="$INSTALL_DIR"
exec bash "$INSTALL_DIR/scripts/deploy.sh" "$@"
