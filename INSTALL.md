# Utterlog 安装指南

## 要求

- VPS 任何配置（512MB 起步即可 —— 脚本自动检测内存选最佳模式）
- Docker + Docker Compose plugin

就这些。`make` / `git` 都不是必须（后面的命令会给出不依赖的等价写法）。

---

## 一行部署

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | bash
```

就这一条。脚本自动：
- 检查 Docker
- 克隆仓库到当前目录的 `utterlog/`
- 跑 `scripts/deploy.sh`（生成密码 / 找端口 / 拉镜像 / 健康检查 / 打印凭据）

**想同时开启自动 HTTPS？** 带上 `DOMAIN`：

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | DOMAIN=blog.yoursite.com bash
```

---

## 日后更新

**推荐 —— 同一行 curl 命令（零额外依赖）**：

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | bash
```

在 `utterlog/` 的上一级目录执行。脚本检测到目录已存在 → 自动 `git pull` → 重新部署。不需要 `make`，也不介意你之前是本地 build 还是拉 GHCR 镜像。

**进目录手动**（需要 git）：

```bash
cd utterlog && git pull && bash scripts/deploy.sh
```

**装了 make 的快捷写法**（等价于上一条）：

```bash
cd utterlog && make update
```

三种方式等效，走的都是 `scripts/deploy.sh`，它自动：
1. 检测你的 VPS 内存（≥2GB 本地构建 / <2GB 从 ghcr.io 拉预构建镜像）
2. 保留你 `.env` 里已有的 DB_PASSWORD / JWT_SECRET
3. 复用已占用的 `UTTERLOG_PORT`
4. 重启容器 + 健康检查
5. 打印访问地址 + 下一步提示

升级后浏览器记得 **⌘+Shift+R** 硬刷一次，避免老版 admin 的 CSS/JS 缓存。

---

## 复用现有的 PostgreSQL（低配 VPS / 1Panel / 宝塔 用户）

如果你机器上已经跑了 PostgreSQL（比如 1Panel 自带、或者宝塔装的应用商店服务），不用再让 utterlog 起独占的数据库容器 —— `install.sh` 会自动检测并询问：

```
Scanning for existing PostgreSQL on this host ...

  ✓ PostgreSQL detected: 1Panel-postgresql-z8nZ (postgres:18.3-alpine) on 127.0.0.1:5432

Choose a deployment mode:

  1) Bundled (recommended) — Utterlog 带自己的 postgres 容器，完全隔离。
     占用 ~120MB。
  2) Reuse host PostgreSQL  — 接到上面的 postgres（省一个数据库容器）。
     pgvector 缺失会自动装（apk add postgresql-pgvector / apt install
     postgresql-XX-pgvector）。会问你 postgres 超级用户密码用来 CREATE EXTENSION
     和建立 utterlog 专用数据库。

  Choice [1]: 2

  Postgres superuser [postgres]:
  Postgres superuser password (input hidden): ...
  ✓ Connected to PostgreSQL at 127.0.0.1:5432
  ✓ pgvector binary already available
  ✓ Role 'utterlog' created
  ✓ Database 'utterlog' created (owner: utterlog)
  ✓ Extension 'vector' active in database 'utterlog'
```

**如果不需要交互**（自动化部署），直接用环境变量跳过向导：

```bash
# 强制 bundled（默认，跟旧版一致）
UTTERLOG_DB_MODE=bundled curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | bash

# 强制复用 host 服务（要求你已配好 .env 里的 DB_HOST / DB_PASSWORD 等）
UTTERLOG_DB_MODE=external curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | bash
```

Bun 版使用 app 进程内内存做临时状态（验证码、在线访客、Coding 缓存等），无需额外缓存服务。

**给已经跑起来想切到外部数据库的老站**：编辑 `.env`，加 `UTTERLOG_DB_MODE=external` + 必要的 DB 连接配置，然后重跑 `bash scripts/deploy.sh`。`docker-compose.external-db.yml` overlay 自动启用，旧的 utterlog-postgres 容器会被 stop 掉（数据保留在 ./pgdata 里，需要手动迁移到外部 postgres）。

**手动跑 pgvector 安装**（绕过 install.sh）：

```bash
bash scripts/setup-pgvector.sh \
    --host 127.0.0.1 --port 5432 \
    --container 1Panel-postgresql-z8nZ --flavor alpine \
    --superuser postgres --superpass <你的密码> \
    --db utterlog --user utterlog --pass <随机密码>
```

---

## 初次部署成功后

看到：
```
Access URL: http://127.0.0.1:9260  (loopback only, not public)
Point your reverse proxy at 127.0.0.1:9260
```

---

## 配反代（选一个场景）

Utterlog 只绑本机（`127.0.0.1`），公网看不到。你需要用已有反代软件把域名转发过去：

| 你的情况 | 怎么配 |
|---|---|
| **1Panel / 宝塔 / AAPanel** | 面板里加反向代理，域名 + `http://127.0.0.1:9260` → 见 [deploy/1panel.md](deploy/1panel.md) |
| **自建 nginx** | 复制 [deploy/nginx.conf.example](deploy/nginx.conf.example) 片段 |
| **自建 Caddy** | 复制 [deploy/Caddyfile.example](deploy/Caddyfile.example) |
| **纯净 VPS 啥都没有** | 换 `DOMAIN=blog.你域名 bash scripts/deploy.sh --tls`（没 make 时；有 make 用 `make deploy-tls`）—— 自带 Caddy 自动 TLS |

完成后浏览器访问你的域名 → `/install` 向导 → 创建管理员。

---

## 常用命令

所有命令都给了两种写法（有 / 无 make）：

```bash
# 看日志
docker compose -f docker-compose.prod.yml logs -f     # 无 make
make logs                                             # 有 make

# 容器状态
docker compose -f docker-compose.prod.yml ps          # 无 make
make ps                                               # 有 make

# 停止
docker compose -f docker-compose.prod.yml stop        # 无 make
make stop                                             # 有 make
```

装了 make 可以 `make help` 看全量列表。

---

## 故障排查

### 部署后打不开
```bash
docker compose -f docker-compose.prod.yml ps          # app + postgres 应 healthy
docker compose -f docker-compose.prod.yml logs app    # 看 Bun app 错误
```

### 想重装
```bash
# 无 make
docker compose -f docker-compose.prod.yml down -v     # 需确认再跑（会删数据）
bash scripts/deploy.sh

# 有 make
make clean && make deploy
```

### API 没响应
检查反代目标端口是否跟 `.env` 里的 `UTTERLOG_PORT` 一致：
```bash
grep UTTERLOG_PORT .env
curl http://127.0.0.1:$(grep UTTERLOG_PORT .env | cut -d= -f2)/api/v1/install/status
```

### 域名 HTTPS 证书申请失败（--tls 模式）
```bash
# DNS 是否解析到 VPS（dig 可能没装，可用 getent 或 nslookup）
getent hosts blog.yoursite.com
# Caddy 日志
docker compose -f docker-compose.prod.yml logs caddy | grep -i 'certificate\|error'
```

---

## 裸机部署（无 Docker）

不推荐。细节见 [deploy/README.md](deploy/README.md) 末尾。

## 更新 schema（开发）

```bash
bash scripts/dump-schema.sh     # 无 make
make schema                     # 有 make（等价）

git add app/server/assets/schema.sql
git commit -m "schema: <描述>"
```
