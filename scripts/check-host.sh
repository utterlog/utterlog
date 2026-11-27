#!/usr/bin/env bash
set -Eeuo pipefail

origin="${1:?missing local server URL}"
bun_bin="${2:?missing Bun executable}"
expected_commit="${3:-}"
mode="${4:-installed}"

request() { curl -fsS --max-time 5 "$origin$1"; }

status="$(request /api/v1/install/status)" || exit 1
printf '%s' "$status" | "$bun_bin" -e '
  const { success, data } = await Bun.stdin.json();
  if (!success || data?.db_ok !== true || data?.schema_ok !== true) process.exit(1);
  if (process.argv.at(-1) === "installed" && data.installed !== true) process.exit(1);
' -- "$mode" || exit 1

if [ -n "$expected_commit" ]; then
  health="$(request /api/v1/health)" || exit 1
  printf '%s' "$health" | "$bun_bin" -e '
    const { success, data } = await Bun.stdin.json();
    if (!success || data?.status !== "ok" || data?.commit !== process.argv.at(-1)) process.exit(1);
  ' -- "$expected_commit" || exit 1
fi

if [ "$mode" = installed ]; then
  home="$(request /)" || exit 1
  admin="$(request /admin/)" || exit 1
  [[ "$home" == *'</html>'* && "$admin" == *'/admin/assets/'* ]] || exit 1
fi
