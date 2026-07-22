#!/usr/bin/env bash
# Utterlog one-line host installer: Git checkout + Bun/systemd deployment.
set -Eeuo pipefail

REPO_URL="${UTTERLOG_REPO:-https://github.com/utterlog/utterlog.git}"
INSTALL_DIR="${UTTERLOG_DIR:-/opt/utterlog}"

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      printf '%s\n' \
        'Usage: curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | sudo bash' \
        '' \
        'Environment: UTTERLOG_DIR, UTTERLOG_REPO, DOMAIN, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.'
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
  printf '==> Updating existing checkout: %s\n' "$INSTALL_DIR"
  branch="$(git -c safe.directory="$INSTALL_DIR" -C "$INSTALL_DIR" symbolic-ref --short HEAD)"
  git -c safe.directory="$INSTALL_DIR" -C "$INSTALL_DIR" fetch origin "$branch"
  git -c safe.directory="$INSTALL_DIR" -C "$INSTALL_DIR" merge --ff-only "origin/$branch"
elif [ -e "$INSTALL_DIR" ]; then
  printf 'Install path exists but is not a Git checkout: %s\n' "$INSTALL_DIR" >&2
  exit 1
else
  printf '==> Cloning Utterlog into %s\n' "$INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

export UTTERLOG_INSTALL_DIR="$INSTALL_DIR"
exec bash "$INSTALL_DIR/scripts/deploy.sh" "$@"
