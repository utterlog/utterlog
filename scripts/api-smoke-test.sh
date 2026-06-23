#!/usr/bin/env bash
# Utterlog public API smoke test — run against BASE_URL (default http://127.0.0.1:8080)
set -uo pipefail

BASE="${1:-http://127.0.0.1:8080}"
PASS=0
FAIL=0
SKIP=0
AUTH=0
declare -a FAILURES=()

log() { printf '%s\n' "$*"; }

# method path [expected_codes_csv] [extra_curl_args...]
check() {
  local method="$1" path="$2" expect="${3:-200}"
  local url="${BASE}${path}"
  local code body ok=0
  if [[ "$method" == "GET" ]]; then
    body=$(curl -sS -w '\n%{http_code}' "$url" 2>/dev/null) || body=$'\n000'
  else
    body=$(curl -sS -w '\n%{http_code}' -X "$method" -H 'content-type: application/json' -d '{}' "$url" 2>/dev/null) || body=$'\n000'
  fi
  code="${body##*$'\n'}"
  body="${body%$'\n'*}"
  IFS=',' read -ra codes <<< "$expect"
  for c in "${codes[@]}"; do
    [[ "$code" == "$c" ]] && ok=1 && break
  done
  if [[ $ok -eq 1 ]]; then
    ((PASS++)) || true
    printf '  \033[32m✓\033[0m %3s %s\n' "$code" "$path"
  else
    local snippet
    snippet=$(printf '%s' "$body" | head -c 120 | tr '\n' ' ')
    ((FAIL++)) || true
    FAILURES+=("$code $method $path :: $snippet")
    printf '  \033[31m✗\033[0m %3s %s  (want %s)\n' "$code" "$path" "$expect"
  fi
}

check_auth() {
  local method="$1" path="$2" expect="${3:-401,403}"
  local url="${BASE}${path}"
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' -X "$method" -H 'content-type: application/json' -d '{}' "$url" 2>/dev/null || echo 000)
  local ok=0
  IFS=',' read -ra codes <<< "$expect"
  for c in "${codes[@]}"; do
    [[ "$code" == "$c" ]] && ok=1 && break
  done
  if [[ $ok -eq 1 ]]; then
    ((AUTH++)) || true
    printf '  \033[33m🔒\033[0m %3s %s (auth/status ok)\n' "$code" "$path"
  else
    ((FAIL++)) || true
    FAILURES+=("$code $method $path :: expected $expect without token")
    printf '  \033[31m✗\033[0m %3s %s  (want %s)\n' "$code" "$path" "$expect"
  fi
}

json_field() {
  python3 -c "import sys,json; d=json.load(sys.stdin); $1" 2>/dev/null || echo ""
}

log "=== Utterlog API smoke test ==="
log "BASE: $BASE"
log ""

# Bootstrap sample IDs
POSTS=$(curl -sS "${BASE}/api/v1/posts?per_page=1" 2>/dev/null || echo '{}')
POST_ID=$(printf '%s' "$POSTS" | json_field "rows=d.get('data',[]); print(rows[0]['id'] if rows else 1)")
POST_SLUG=$(printf '%s' "$POSTS" | json_field "rows=d.get('data',[]); print(rows[0].get('slug','') if rows else '')")
DISPLAY_ID=$(printf '%s' "$POSTS" | json_field "rows=d.get('data',[]); print(rows[0].get('display_id','') if rows else '')")

CATS=$(curl -sS "${BASE}/api/v1/categories" 2>/dev/null || echo '{}')
CAT_ID=$(printf '%s' "$CATS" | json_field "rows=d.get('data',[]); print(rows[0]['id'] if rows else 1)")

TAGS=$(curl -sS "${BASE}/api/v1/tags" 2>/dev/null || echo '{}')
TAG_ID=$(printf '%s' "$TAGS" | json_field "rows=d.get('data',[]); print(rows[0]['id'] if rows else 1)")

log "Sample IDs: post=$POST_ID slug=$POST_SLUG display=$DISPLAY_ID cat=$CAT_ID tag=$TAG_ID"
log ""
log "--- Health & Install ---"
check GET /api/v1/health
check GET /api/v1/install/status
check GET /api/v1/setup/status

log ""
log "--- Public content ---"
check GET /api/v1/options
check GET /api/v1/owner
check GET /api/v1/archive/stats
check GET /api/v1/posts
check GET "/api/v1/posts/${POST_ID}"
check GET "/api/v1/posts/${POST_ID}/navigation"
check GET "/api/v1/posts/${POST_ID}/comments"
check GET "/api/v1/posts/${POST_ID}/episodes"
[[ -n "$POST_SLUG" ]] && check GET "/api/v1/posts/slug/${POST_SLUG}"
[[ -n "$DISPLAY_ID" ]] && check GET "/api/v1/posts/by-display-id/${DISPLAY_ID}"
check GET /api/v1/categories
check GET "/api/v1/categories/${CAT_ID}"
check GET /api/v1/tags
check GET "/api/v1/tags/${TAG_ID}"
check GET "/api/v1/comments?post_id=${POST_ID}&status=approved&per_page=5"
check GET /api/v1/search?q=test
check GET /api/v1/feed
check GET /api/v1/footprints
check GET "/api/v1/annotations?post_id=${POST_ID}"
check GET /api/v1/online
check GET /api/v1/visitor/geo
check GET /api/v1/visitor/weather
check GET /api/v1/coding
check GET /api/v1/federation/metadata
check GET /api/v1/public/albums
check GET /api/v1/moments/recent-tags
check GET /api/v1/captcha/challenge
check GET /api/v1/captcha/image 200,400
check GET /api/v1/i18n/locales
check GET /api/v1/i18n/current
check GET /api/v1/i18n/zh-CN
check GET /api/v1/system/status
check GET /api/v1/social/feed-timeline
check GET /api/v1/social/feed-stats
check GET /api/v1/location/reverse?lat=39.9&lon=116.4

log ""
log "--- Generic content tables ---"
for t in moments music movies books games videos goods links playlists; do
  check GET "/api/v1/${t}"
done

log ""
log "--- SEO / static ---"
check GET /robots.txt
check GET /sitemap.xml
check GET /llms.txt
check GET /llms-full.txt

log ""
log "--- Track & misc POST (public) ---"
check POST /api/v1/track 200,400,204
check POST /api/v1/track/duration 200,400,204
check GET "/api/v1/music/search?q=test" 200,400
check GET /api/v1/auth/passkey/available
check GET /api/v1/rss/parse?url=https://xifeng.net/feed 200,400,502
check POST /api/v1/passport/identify 200,400
check POST /api/v1/comments/federated 400,401,403,422
check POST /api/v1/federation/follow 400,422
check POST /api/v1/federation/verify 400,422
check POST /api/v1/links/apply 400,422

log ""
log "--- Admin-only sample (expect 401) ---"
check POST /api/v1/auth/login 400,401,422
check POST /api/v1/auth/refresh 400,401,422
check_auth GET /api/v1/auth/me
check_auth GET /api/v1/profile
check_auth GET /api/v1/admin/stats
check_auth GET /api/v1/media
check_auth GET /api/v1/themes
check_auth GET /api/v1/plugins
check_auth GET /api/v1/backup/list
check_auth GET /api/v1/ai/providers
check_auth GET /api/v1/security/overview
check_auth GET /api/v1/notifications
check_auth GET /api/v1/analytics
check_auth POST /api/v1/posts
check_auth GET /api/v1/admin/footprints
check_auth GET /api/v1/admin/system/version
check_auth GET /api/v1/admin/ai-comments
check_auth GET /api/v1/network/status
check_auth GET /api/v1/ai/logs
check_auth GET /api/v1/ai/batch-status
check_auth GET /api/v1/comments/pending-count
check_auth GET /api/v1/albums
check_auth GET /api/v1/import/status 401,404
check_auth POST /api/v1/ai/reader-chat 200,400,401,422
check POST /api/v1/auth/forgot-password 200,400,422

log ""
log "--- Data integrity checks ---"
AUTHOR=$(curl -sS "${BASE}/api/v1/posts/${POST_ID}" | json_field "p=d.get('data',{}).get('author') or {}; print(p.get('nickname',''))")
if [[ -n "$AUTHOR" && "$AUTHOR" != "None" ]]; then
  ((PASS++)) || true
  log "  \033[32m✓\033[0m post author present: $AUTHOR"
else
  ((FAIL++)) || true
  FAILURES+=("post author missing on /api/v1/posts/${POST_ID}")
  log "  \033[31m✗\033[0m post author missing"
fi

CC=$(curl -sS "${BASE}/api/v1/comments?post_id=${POST_ID}&status=approved&per_page=1" | json_field "rows=d.get('data',[]); print(len(rows))")
if [[ "${CC:-0}" -ge 0 ]]; then
  ((PASS++)) || true
  log "  \033[32m✓\033[0m comments list returns data (count sample: $CC)"
else
  ((FAIL++)) || true
  FAILURES+=("comments list broken")
  log "  \033[31m✗\033[0m comments list broken"
fi

CACHE=$(curl -sSI "${BASE}/api/v1/system/status" | grep -i '^cache-control:' | tr -d '\r' || true)
if echo "$CACHE" | grep -qi 'no-store\|no-cache'; then
  ((PASS++)) || true
  log "  \033[32m✓\033[0m API cache-control: $CACHE"
else
  ((FAIL++)) || true
  FAILURES+=("API missing no-store: $CACHE")
  log "  \033[31m✗\033[0m API cache-control bad: $CACHE"
fi

log ""
log "=== Summary ==="
log "PASS: $PASS  FAIL: $FAIL  AUTH_OK: $AUTH  SKIP: $SKIP"
if [[ ${#FAILURES[@]} -gt 0 ]]; then
  log ""
  log "Failures:"
  for f in "${FAILURES[@]}"; do log "  - $f"; done
  exit 1
fi
exit 0
