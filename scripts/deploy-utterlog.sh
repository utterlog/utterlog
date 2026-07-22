#!/usr/bin/env bash
# Compatibility entry point. New deployments use the Bun/systemd SSH workflow.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/scripts/deploy-utterlog-bun.sh" "$@"
