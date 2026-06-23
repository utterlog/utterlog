#!/usr/bin/env bash
# ============================================================
# deploy.sh — one-command production deployment for Utterlog
#
# Does:
#   1. Auto-generate .env with random DB_PASSWORD / JWT_SECRET (if missing)
#   2. Scan for a free TCP port starting from UTTERLOG_PORT
#   3. docker compose up -d --build
#   4. Poll /api/v1/install/status until healthy
#   5. Print access URL + all credentials + nginx / caddy snippet
#
# Usage:
#   bash scripts/deploy.sh             # full deploy
#   bash scripts/deploy.sh --no-build  # skip rebuild
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)

# Color helpers (no-op if not a tty)
if [ -t 1 ]; then
  C_BLUE=$'\e[34m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'
  C_RED=$'\e[31m'; C_DIM=$'\e[2m'; C_BOLD=$'\e[1m'; C_RESET=$'\e[0m'
else
  C_BLUE=; C_GREEN=; C_YELLOW=; C_RED=; C_DIM=; C_BOLD=; C_RESET=
fi

log()  { printf "%s==>%s %s\n" "$C_BLUE$C_BOLD" "$C_RESET" "$*"; }
ok()   { printf "%s✓%s %s\n" "$C_GREEN$C_BOLD" "$C_RESET" "$*"; }
warn() { printf "%s!%s %s\n" "$C_YELLOW$C_BOLD" "$C_RESET" "$*"; }
err()  { printf "%s✗%s %s\n" "$C_RED$C_BOLD" "$C_RESET" "$*" >&2; }

# ============================================================
# Step 1: ensure docker is installed
# ============================================================
if ! command -v docker >/dev/null 2>&1; then
  err "未检测到 docker，请先安装：https://docs.docker.com/engine/install/"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  err "未检测到 docker compose 插件，请先安装：sudo apt install docker-compose-plugin"
  exit 1
fi

# ============================================================
# Step 2: auto-generate .env if missing (with random secrets)
# ============================================================
rand_str() {
  local len="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$len"
  else
    LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$len"
  fi
  echo
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

GENERATED=0
INTERACTIVE=0
TLS_MODE=0
NO_BUILD=0
PULL_MODE=-1   # -1 = auto-detect, 0 = force build, 1 = force pull
# Parse flags
for arg in "$@"; do
  case "$arg" in
    --interactive|-i) INTERACTIVE=1 ;;
    --tls)            TLS_MODE=1 ;;
    --no-build)       NO_BUILD=1 ;;
    --pull)           PULL_MODE=1 ;;
    --build)          PULL_MODE=0 ;;
  esac
done

# Auto-detect deployment strategy based on available RAM.
# Building images locally needs ~2GB RAM (Bun + Next.js build).
# Below that, pulling pre-built images from GHCR is faster and safer.
if [ "$PULL_MODE" -eq -1 ]; then
  if [ -r /proc/meminfo ]; then
    total_kb=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)
    total_mb=$((total_kb / 1024))
    if [ "$total_mb" -lt 1800 ]; then
      PULL_MODE=1
      log "检测到 ${total_mb}MB 内存 → 拉取 ghcr.io 预构建镜像（小内存 VPS 更稳）"
    else
      PULL_MODE=0
      log "检测到 ${total_mb}MB 内存 → 本地编译镜像（改源码后迭代更快）"
    fi
  elif [ "$(uname)" = "Darwin" ]; then
    # macOS dev machine — always plenty of RAM
    PULL_MODE=0
  else
    # Unknown platform — play safe, pull
    PULL_MODE=1
  fi
fi

if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    err "找不到 .env.example —— 当前目录看起来不是 Utterlog 项目"
    exit 1
  fi

  if [ "$INTERACTIVE" -eq 1 ] && [ -t 0 ]; then
    # --- Interactive mode: prompt user ---
    log "交互式配置。直接回车使用随机值，或输入自定义值。"
    echo
    suggested_db=$(rand_str 16)
    suggested_jwt=$(rand_str 48)
    printf "  DB_PASSWORD（默认 16 位随机）: "
    read -r USER_DB_PASSWORD
    [ -z "$USER_DB_PASSWORD" ] && USER_DB_PASSWORD="$suggested_db"
    printf "  JWT_SECRET （默认 48 位随机）: "
    read -r USER_JWT_SECRET
    [ -z "$USER_JWT_SECRET" ] && USER_JWT_SECRET="$suggested_jwt"
    cp .env.example .env
    sed -i.bak "s|^DB_PASSWORD=.*|DB_PASSWORD=$USER_DB_PASSWORD|" .env
    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$USER_JWT_SECRET|" .env
    rm -f .env.bak
    DB_PASSWORD_GEN="$USER_DB_PASSWORD"
    JWT_SECRET_GEN="$USER_JWT_SECRET"
    GENERATED=1
    ok "已生成 .env"
  else
    # --- Auto mode: generate randoms ---
    log "自动生成 .env（密码使用 /dev/urandom 随机）..."
    log "  — 每次部署都使用全新随机值，不存在共享默认密码"
    log "  — 如需自定义密码：make deploy-interactive"
    DB_PASSWORD_GEN=$(rand_str 16)
    JWT_SECRET_GEN=$(rand_str 48)
    cp .env.example .env
    if command -v sed >/dev/null 2>&1; then
      sed -i.bak "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD_GEN|" .env
      sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET_GEN|" .env
      rm -f .env.bak
    fi
    GENERATED=1
    ok "已生成 .env 及随机凭据"
  fi
else
  ok ".env 已存在，沿用现有配置（不会重新生成密码）"
fi

# Source .env
set -a
. ./.env
set +a

if [ "${UTTERLOG_DB_MODE:-bundled}" = "external" ]; then
  if [ -z "${DB_HOST:-}" ] || [ "${DB_HOST:-}" = "postgres" ]; then
    export DB_HOST="host.docker.internal"
    persist_env DB_HOST "$DB_HOST"
    warn "UTTERLOG_DB_MODE=external：DB_HOST 仍是默认值，已改为 host.docker.internal"
  fi
fi

if [ "$PULL_MODE" -eq 1 ] && [ -z "${UTTERLOG_IMAGE_PREFIX:-}" ]; then
  export UTTERLOG_IMAGE_PREFIX="ghcr.io/utterlog"
  persist_env UTTERLOG_IMAGE_PREFIX "$UTTERLOG_IMAGE_PREFIX"
fi

# ============================================================
# Step 3: find a free port (starting from UTTERLOG_PORT)
# ============================================================
START_PORT="${UTTERLOG_PORT:-9260}"
log "检查端口 $START_PORT 是否可用 ..."

if ! NEW_PORT=$(bash scripts/find-free-port.sh "$START_PORT" 50); then
  err "范围 $START_PORT-$((START_PORT+49)) 内没有空闲端口"
  exit 1
fi

if [ "$NEW_PORT" != "$START_PORT" ]; then
  warn "端口 $START_PORT 被占用 —— 改用 $NEW_PORT"
  if grep -q "^UTTERLOG_PORT=" .env; then
    sed -i.bak "s|^UTTERLOG_PORT=.*|UTTERLOG_PORT=$NEW_PORT|" .env
  else
    echo "UTTERLOG_PORT=$NEW_PORT" >> .env
  fi
  rm -f .env.bak
  UTTERLOG_PORT="$NEW_PORT"
else
  ok "端口 $START_PORT 可用"
fi

# ============================================================
# Step 3b: TLS mode — prompt for / validate domain
# ============================================================
if [ "$TLS_MODE" -eq 1 ]; then
  if [ -z "${DOMAIN:-}" ]; then
    if [ -t 0 ]; then
      echo
      log "已启用 TLS 模式 —— Caddy 会自动申请 Let's Encrypt 证书"
      printf "  请输入域名（例：blog.example.com）: "
      read -r DOMAIN
    fi
    if [ -z "${DOMAIN:-}" ]; then
      err "TLS 模式必须指定 DOMAIN。重新运行："
      err "  DOMAIN=blog.example.com make deploy-tls"
      exit 1
    fi
  fi
  # Persist DOMAIN to .env for later `make` commands
  if grep -q "^DOMAIN=" .env 2>/dev/null; then
    sed -i.bak "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" .env && rm -f .env.bak
  else
    echo "DOMAIN=$DOMAIN" >> .env
  fi
  export DOMAIN
  # Also set APP_URL to the public https URL so the app serves correct absolute links
  if grep -q "^APP_URL=" .env; then
    sed -i.bak "s|^APP_URL=.*|APP_URL=https://$DOMAIN|" .env && rm -f .env.bak
  fi
  export COMPOSE_PROFILES=tls
  ok "TLS 模式：$DOMAIN"
fi

# ============================================================
# Step 4: build & start containers
# ------------------------------------------------------------
# UTTERLOG_DB_MODE=external disables the bundled postgres service and
# lets the Bun app reach the host DB via host.docker.internal.
# ============================================================
EXTERNAL_OVERLAY=""
DB_M="${UTTERLOG_DB_MODE:-bundled}"
if [ "$DB_M" = "external" ]; then
  EXTERNAL_OVERLAY="-f docker-compose.external-db.yml"
  log "复用外部 PostgreSQL（UTTERLOG_DB_MODE=$DB_M）"
fi

if [ "$PULL_MODE" -eq 1 ]; then
  # Pull pre-built images — skips all local compilation
  COMPOSE="docker compose -f docker-compose.prod.yml -f docker-compose.pull.yml $EXTERNAL_OVERLAY"
  log "拉取 ${UTTERLOG_IMAGE_PREFIX:-ghcr.io/utterlog} 预构建镜像 ..."
  $COMPOSE pull
  log "启动容器 ..."
  $COMPOSE up -d
elif [ "$NO_BUILD" -eq 1 ]; then
  COMPOSE="docker compose -f docker-compose.prod.yml $EXTERNAL_OVERLAY"
  log "启动容器（不重新构建）..."
  $COMPOSE up -d
else
  COMPOSE="docker compose -f docker-compose.prod.yml $EXTERNAL_OVERLAY"
  log "本地构建并启动容器（首次约 3-5 分钟，需要 2GB+ 内存）..."
  log "  提示：低配机可改用 'make deploy-pull' 拉预构建镜像，跳过本地编译"
  $COMPOSE up -d --build
fi

# ============================================================
# Step 5: wait for app to respond
# ============================================================
log "等待 Bun app 就绪（最长 180 秒）..."
HEALTHY=0
for i in $(seq 1 36); do
  if curl -fsS "http://127.0.0.1:$UTTERLOG_PORT/api/v1/install/status" >/dev/null 2>&1; then
    HEALTHY=1
    ok "Bun app 已响应（用时 ${i}×5 秒）"
    break
  fi
  printf "   %s... 启动中 (%ds)%s\r" "$C_DIM" "$((i*5))" "$C_RESET"
  sleep 5
done
echo

if [ "$HEALTHY" -eq 0 ]; then
  err "Bun app 在 180 秒内未响应。下方是最近 40 行日志："
  $COMPOSE logs app --tail=40
  exit 1
fi

# ============================================================
# Step 6: print access details
# ============================================================
if [ "$TLS_MODE" -eq 1 ]; then
  cat <<EOF

${C_GREEN}${C_BOLD}============================================================${C_RESET}
${C_GREEN}${C_BOLD}  Utterlog 已上线：https://$DOMAIN ${C_RESET}
${C_GREEN}${C_BOLD}============================================================${C_RESET}

  ${C_BOLD}Caddy 正在后台申请 Let's Encrypt 证书${C_RESET}
  首次访问可能需要 5-30 秒等待证书签发

  ${C_BOLD}查看证书状态：${C_RESET}
    $COMPOSE logs caddy | grep -i "certificate obtained\|error"

  ${C_BOLD}下一步：${C_RESET}
    打开 https://$DOMAIN  →  /install 向导创建管理员账户

EOF
else
  cat <<EOF

${C_GREEN}${C_BOLD}============================================================${C_RESET}
${C_GREEN}${C_BOLD}  Utterlog 部署完成${C_RESET}
${C_GREEN}${C_BOLD}============================================================${C_RESET}

  ${C_BOLD}访问地址：${C_RESET}
    http://127.0.0.1:$UTTERLOG_PORT  （仅本机环回，公网不可见）

  ${C_BOLD}下一步：把反向代理指向 127.0.0.1:$UTTERLOG_PORT${C_RESET}

  ${C_BOLD}各场景配置参考：${C_RESET}
    • 1Panel / 宝塔 / AAPanel → 见 deploy/1panel.md
    • 自建 nginx              → 见 deploy/nginx.conf.example
    • 自建 Caddy              → 见 deploy/Caddyfile.example
    • 还没有反代？            → 重跑：DOMAIN=你的域名 make deploy-tls
                                  （启用内置 Caddy 占用 80/443）

  ${C_BOLD}本地隧道测试（域名还没指过来时）：${C_RESET}
    ssh -L 9260:127.0.0.1:$UTTERLOG_PORT your-vps
    # 然后浏览器打开 http://localhost:9260

EOF
fi

if [ "$GENERATED" -eq 1 ]; then
  cat <<EOF
  ${C_YELLOW}${C_BOLD}⚠  请妥善保存以下随机生成的凭据（只显示一次）：${C_RESET}

    DB_PASSWORD = $DB_PASSWORD
    JWT_SECRET  = $JWT_SECRET

  两者都已写入 .env，建议把 .env 备份到安全的地方。

EOF
fi

cat <<EOF
  ${C_BOLD}常用命令：${C_RESET}
    $COMPOSE logs -f              # 实时查看全部日志
    $COMPOSE logs -f app          # 只看 Bun app 日志
    $COMPOSE ps                   # 容器状态
    $COMPOSE down                 # 停止
    make deploy                   # 重新部署（等价于 bash scripts/deploy.sh）

  ${C_BOLD}反代配置示例：${C_RESET}见 deploy/ 目录

${C_DIM}============================================================${C_RESET}

EOF
