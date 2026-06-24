#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Export tag map (before delete)"
MAP_FILE="$(mktemp)"
bun scripts/remap-versions.mjs --export-shell > "$MAP_FILE"

echo "==> Delete remote tags"
while read -r t; do
  [[ -z "$t" ]] && continue
  git push origin ":refs/tags/$t" || true
done < <(git ls-remote --tags origin 2>/dev/null | awk -F/ '{print $3}' | sed 's/\^{}//' | sort -u || true)

echo "==> Delete local tags"
if tags=$(git tag -l); then
  if [ -n "$tags" ]; then
    echo "$tags" | xargs git tag -d
  fi
fi

echo "==> Create remapped tags (v1.0.0 … v1.3.6)"
while IFS=$'\t' read -r newTag commit; do
  git tag -a "$newTag" -m "Utterlog ${newTag#v}" "$commit"
done < "$MAP_FILE"
rm -f "$MAP_FILE"

echo "==> Tags created: $(git tag -l 'v1.*' | wc -l | tr -d ' ')"
