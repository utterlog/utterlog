# Utterlog 开发说明

面向本地开发与依赖维护。部署见 [INSTALL.md](./INSTALL.md)，AI/架构细节见 [AGENT.md](./AGENT.md)。

## 环境要求

| 工具 | 版本 | 说明 |
|------|------|------|
| **Bun** | 1.4.0+ | 运行时、包管理、单进程服务 |
| **Node.js** | 20.19+ 或 22.12+ | Admin 使用 Vite 8 开发/构建时需要（Bun 跑 server 不依赖 Node） |
| **PostgreSQL** | 18 + pgvector | 本地可用 Docker Compose 或外部实例 |
| **Docker** | 可选 | 生产/类生产部署 |

## 技术栈与版本（2026-06 升级后）

| 层 | 技术 | 版本 |
|---|---|---|
| 运行时 | Bun | 1.4.0 canary |
| API / 网关 | Hono | ^4.12 |
| 博客 SSR | React | ^19.2.7 |
| 管理后台 | Vite + React + TanStack Router | Vite ^8.1 / React ^19.2 |
| 数据库 | PostgreSQL + pgvector | 18 |
| 校验 | Zod | ^4.4（全仓库统一 v4） |
| 样式 | Tailwind CSS | ^4.3 |

### 主要依赖升级摘要

- **Vite 6 → 8**：Admin 构建改用 Rolldown；`rollupOptions` 已迁移为 `rolldownOptions.output.codeSplitting`
- **@vitejs/plugin-react 4 → 6**：基于 Oxc 的 React Refresh，不再依赖 Babel
- **Zod 3 → 4**：`app/admin`、`app/web` 与根 workspace 对齐
- **nodemailer 8 → 9**：SMTP 发送 API 无改动

## 仓库结构（开发视角）

```
app/start/src/backend/     Bun API + SSR 网关（改后端从这里开始）
app/admin/      Vite 管理后台 SPA（/admin）
app/web/        博客页面、主题、组件（SSR 源）
app/shared/     跨包共享
app/start/      TanStack Start 应用与文件路由
```

Monorepo 使用 **单一根 lockfile**（`bun.lock`）。不要在 `app/admin` 或 `app/web` 下单独维护 `bun.lock`。

## 首次启动

```bash
cp .env.example .env
# 编辑 .env：DB_PASSWORD、JWT_SECRET、APP_URL 等

bun install
bun run build:admin
bun run start:build
bun run dev          # 默认 :8080
```

带 PostgreSQL 的 Docker 开发：

```bash
make dev             # docker compose up
# 或
make dev-local       # 仅 bun server，需已有 DB
```

## 常用命令

| 命令 | 作用 |
|------|------|
| `bun run dev` | 启动 Bun 网关（API + SSR + 静态） |
| `bun run server:check` | Server TypeScript 类型检查 |
| `bun run test:server` | Server 单元测试 |
| `bun run build:admin` | 构建管理后台 → `app/admin/dist/` |
| `bun run start:build` | 构建 TanStack Start 应用 |
| `bun run build:web` | 同步主题样式到 public |

### Admin 独立开发（热更新）

需先启动 API 服务（`bun run dev` 或 Docker），再在另一终端：

```bash
cd app/admin
bun run dev          # Vite dev server :5173，/api 代理到 :8080
```

环境变量 `UTTERLOG_API_DEV_TARGET` 可改代理目标（默认 `http://localhost:8080`）。

## 改代码该去哪

| 目标 | 路径 |
|------|------|
| REST API | `app/start/src/backend/routes/` |
| SSR 路由/渲染 | `app/start/src/backend/web/` |
| 数据库 schema | `app/start/assets/schema.sql`（改完 `make schema`） |
| 后台页面 | `app/admin/src/pages/` |
| 博客路由 | `app/start/src/routes/` |
| 主题 | `app/web/themes/{Name}/` |
| 主题注册 | `app/web/lib/theme-data.ts` / `app/start/src/backend/blog-themes.ts` |

## Vite 8 配置说明（Admin）

`app/admin/vite.config.ts` 关键变更：

```ts
build: {
  rolldownOptions: {
    output: {
      codeSplitting: {
        groups: [
          { name: 'react', test: /node_modules\/(react|react-dom|react-router-dom)/, priority: 20 },
          { name: 'vendor', test: /node_modules\/(axios|zustand|react-hot-toast)/, priority: 15 },
        ],
      },
    },
  },
}
```

- 不再使用 `build.rollupOptions.output.manualChunks`（对象形式已移除）
- 默认 JS 压缩为 Oxc，CSS 压缩为 Lightning CSS
- 大 chunk 警告可通过 `codeSplitting` 或 `build.chunkSizeWarningLimit` 调整

迁移参考：[Vite 8 Migration Guide](https://vite.dev/guide/migration)

## 依赖升级流程

1. 在**仓库根目录**执行 `bun outdated` 查看可升级项
2. 根 workspace：`bun add <pkg>@latest` 或 `bun add -d <pkg>@latest`
3. Admin 专用包：在 `app/admin` 下 `bun add …`（仍写入根 lockfile）
4. 验证：
   ```bash
   bun install --frozen-lockfile
   bun run server:check
   cd app/admin && bun run build
   bun run start:build
   bun run test:server
   ```
5. 提交 `package.json` + `bun.lock`（及必要的配置迁移）

### 注意事项

- **Zod v4** 与 v3 API 基本兼容；新代码统一 `import { z } from 'zod'`
- **@types/node ^26** 与 server/admin 共用；若类型报错可暂时 pin 到 ^22
- CI 仅执行根目录 `bun install --frozen-lockfile`，不再单独 install admin

## 环境变量（开发常用）

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | 8080 | Bun 服务端口 |
| `DB_*` | — | PostgreSQL 连接 |
| `JWT_SECRET` | — | 必填（生产随机） |
| `APP_URL` | — | 站点公开 URL |
| `INTERNAL_API_URL` | — | SSR 内部 fetch，如 `http://127.0.0.1:8080/api/v1` |
| `NEXT_PUBLIC_API_URL` | `/api/v1` | 浏览器 API 基址（兼容旧环境变量名） |
| `UTTERLOG_API_DEV_TARGET` | `http://localhost:8080` | Admin Vite 代理目标 |

完整列表见 `.env.example`。

## xifeng.net 部署（本地构建，不走 GHA）

目标站点 **https://xifeng.net**，服务器 `124.222.230.137`。详细说明见 [deploy/xifeng/README.md](./deploy/xifeng/README.md)。

**三端一致**：本地 Git HEAD = 远程 `origin` = 容器 `/app/.deploy-revision`。

```bash
git add -A && git commit -m "..."
make deploy-xifeng          # push + preflight + docker build + ssh load + 重启
make deploy-xifeng-dry      # 仅 preflight，不上传
```

要点：

- 镜像在本地 `docker build --platform linux/amd64`，`docker save | gzip | ssh docker load`
- 服务器只跑预构建镜像，不在线上编译
- SSH 密钥默认 `~/Desktop/gentpan.pem`
- 不覆盖服务器 `.env` / `uploads` / `pgdata`

## 测试与类型检查

```bash
JWT_SECRET=test-secret-for-server-tests bun test app/start/src/backend/test
bun run server:check
cd app/admin && bun run build    # 含 tsc -b
```

## 相关文档

- [README.md](./README.md) — 项目概览
- [INSTALL.md](./INSTALL.md) — 部署安装
- [AGENT.md](./AGENT.md) — 架构、主题、数据库约定
