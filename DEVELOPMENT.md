# Utterlog 开发说明

部署见 [INSTALL.md](./INSTALL.md)，架构与协作约定见 [AGENT.md](./AGENT.md)。

## 环境要求

| 工具 | 版本 | 用途 |
|---|---|---|
| Bun | 1.4.0+ | 运行时、包管理、测试与构建 |
| PostgreSQL | 18 + pgvector | 本地或外部数据库 |

项目只维护根目录 `bun.lock`，不要在 workspace 下生成独立锁文件。

## 首次启动

```bash
cp .env.example .env
# 编辑 DB_PASSWORD、JWT_SECRET、APP_URL 等配置

bun install --frozen-lockfile
bun run build
bun run dev
```

应用默认监听 `127.0.0.1:9260`。开发时需要从其他设备访问，可在 `.env` 中显式设置 `HOST=0.0.0.0`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `bun run dev` | 启动 Bun API、SSR 与静态资源网关 |
| `bun run start:dev` | 启动 TanStack Start 开发服务 |
| `bun run check` | 检查服务端与 TanStack Start 类型 |
| `bun run build` | 构建 Admin SPA 与 TanStack Start |
| `bun run test:server` | 运行服务端测试 |
| `bun run audit:api` | 审计后台调用与 API 路由覆盖 |
| `bun run verify` | 执行完整检查、构建、测试与 API 审计 |

### Admin 独立热更新

先启动根服务，再开一个终端：

```bash
cd app/admin
bun run dev
```

Admin 开发服务器运行在 `:5173`，默认把 `/api` 和 `/uploads` 代理到 `http://localhost:9260`。可通过 `UTTERLOG_API_DEV_TARGET` 覆盖。

## 仓库结构

```text
app/start/src/backend/     Bun API、服务与运行时网关
app/start/src/web/         博客页面、主题与组件
app/start/src/routes/      TanStack Start 文件路由
app/admin/                 管理后台 SPA
app/shared/                跨 workspace 共享代码
deploy/systemd/            主机服务与后台更新单元模板
```

## 数据库与测试

本地 PostgreSQL 需要启用 pgvector：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

常规测试在没有测试数据库时会跳过数据库集成用例。运行完整集成测试：

```bash
UTTERLOG_INTEGRATION_DB=1 \
DB_HOST=127.0.0.1 DB_PORT=5432 \
DB_NAME=utterlog_test DB_USER=utterlog_test DB_PASSWORD=utterlog_test \
bun run test:server
```

schema 变更后：

```bash
make schema
git add app/start/assets/schema.sql
```

## 远程部署

首次在服务器运行标准安装器，之后可从开发机同步已验证的源码和构建产物：

```bash
export UTTERLOG_SSH_KEY="$HOME/.ssh/your-key.pem"
export UTTERLOG_DEPLOY_HOST='<your-server-ip>'
export UTTERLOG_DEPLOY_PATH='/opt/utterlog'
export UTTERLOG_APP_URL='https://blog.example.com'

make deploy-utterlog-dry
make deploy-utterlog
```

详细参数见 [deploy/utterlog/README.md](./deploy/utterlog/README.md)。远程同步会保留服务器 `.env`、`uploads/` 和 `content/`。
