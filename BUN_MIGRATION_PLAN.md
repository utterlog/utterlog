# Utterlog Bun Migration Plan

目标架构：

- 默认运行时：`app` + PostgreSQL。
- 外部 PostgreSQL 模式：只运行一个 `app` 容器。
- Go 后端移除。
- Redis 移出核心运行时，后续作为可选 adapter/plugin 接入。
- 前台 Next SSR、管理端 Vite SPA、TypeScript API 由 Bun app 统一承载。

## 已完成

- 新增 Bun/Hono TypeScript API：`app/server/src`。
- 新增路径配置层：`app/server/src/paths.ts` 集中管理 schema、installer、i18n、内置主题/插件、admin dist、旧 public 目录。
- 已合并源码目录到 `app/` 工作区：`app/server`、`app/web`、`app/admin`。
- 移除 Go 源码、Go module、Go Dockerfile、Go embed 入口。
- 复制并改造 schema、安装器、i18n 资源到 `app/server/assets`。
- 默认部署改为 Bun app + PostgreSQL：
  - `Dockerfile.bun`
  - `docker-compose.yml`
  - `docker-compose.prod.yml`
  - `docker-compose.external-db.yml`
  - `deploy/site/docker-compose.yml`
- Redis 从默认安装、部署、安装向导里移除；安装器显示为可选插件策略。
- 前台 Next 与管理端 Vite 代理改为同源 `/api/v1` 或 Bun app。
- CI 和 Docker publish workflow 改为单 app 镜像。
- 已迁移的真实 Bun API：
  - 安装、健康检查、schema bootstrap
  - 登录、刷新、登出、当前用户、密码修改、个人资料读写
  - options、i18n
  - posts、categories、tags、comments、media、albums
  - moments/music/movies/books/games/videos/goods/links/playlists 通用 CRUD
  - post category/tag relationships、post JSON meta、video episodes
  - playlist songs、post navigation、archive/search/feed/sitemap/robots
  - custom DB_PREFIX schema bootstrap
  - profile、passkeys list/delete、notifications read/unread/list/delete
  - captcha challenge、page tracking、online users
  - system status、admin stats、basic analytics
  - AI provider CRUD、AI logs/stats/conversation list/read/delete
  - security event timeline

## 仍需继续真实迁移

这些路由目前有稳定响应，避免页面直接 404/501，但不是旧 Go 逻辑的完整等价实现：

路由入口覆盖审计（2026-05-26）：

- 原 Go `api/main.go` 注册路由：303 条。
- 当前 Bun `app/server/src` 注册路由：306 条。
- Go 路由缺失：0 条。
- Bun 额外路由：`GET /uploads/*`、`GET /api/v1/i18n/current`、`POST /api/v1/playlists/import`。
- 已补齐最后两个 Go 入口：`POST/OPTIONS /api/revalidate` 代理到 Next、`GET /api/v1/analytics/geoip`。

注意：这只代表 HTTP 路由入口齐全，不代表旧 Go handler 的业务逻辑都完成了等价迁移。

- AI：batch jobs、reader chat、cover/slug/tags/summary/format 的真实模型调用。
- Security：ban/settings 的持久化与统计。
- Backup/import/sync：备份创建/导入已有 Bun 闭环，导入前已增加 ZIP 路径穿越与异常条目校验；仍需真实 PostgreSQL restore、WordPress/Typecho XML/批量同步端到端验证。
- Federation/network/social：跨站发现、关注、OAuth、通知；外部 URL/RSS/OGP/network pull 已增加公共 URL 与 DNS SSRF 防护，仍需真实跨站互关注释流端到端验证。
- Passkey/TOTP：完整 WebAuthn、TOTP 多端交互验证；password reset 已实现邮件令牌闭环并改为 hash 存储，仍需真实 SMTP/Resend/Sendflare 端到端验证。
- Analytics：访问日志、地图、breakdown、purge、rollup。
- Media advanced：远程解析、EXIF 解析、缩略图/转码、S3 实测。
- System upgrade：版本检查、sidecar 升级、release notes。
- Footprints/coding/weather/geocode：第三方 API 逻辑和缓存策略。

## 目录合并审查

结论：前后端可以合并到一个源码工作区，但不应把 Next、Vite、Bun API 的文件直接混在同一层。推荐合并为一个 `app/` 工作区目录，内部保留清晰边界：

```text
app/
  server/        Bun API/gateway
  web/           Next.js blog renderer
  admin/         Vite/React admin SPA
  shared/        前后端共用类型、API schema、工具函数
```

目标目录已经收敛为：

```text
utterlog-bun/
  app/
    server/      Bun + Hono API、安装器、静态网关、Next proxy
    web/         Next SSR 前台、主题渲染、公开静态资源
    admin/       Vite/React 管理端 SPA
    shared/      共享类型、DTO、Zod contract、通用工具
  content/       运行时主题/插件挂载点，发布源码只保留占位
  deploy/        Caddy、面板、站点部署模板
  locales/       顶层语言资源或兼容资源
  scripts/       部署、schema、维护脚本
```

旧目录策略：

- `api/` 不再作为目标目录保留，Go 后端与旧 Admin 嵌入资源均迁移到 `app/` 后删除。
- 根 `web/` 不再作为目标目录保留，Next 前台统一在 `app/web`。
- `.next`、`node_modules`、`dist`、`pgdata`、`ssl`、`uploads`、`backup`、`Comment`、`wordpress-plugin` 只允许作为本地产物或外部仓库存在，不进入发布源码。
- `app/web/.env.local` 属于本机密钥配置，默认忽略，不作为源码结构的一部分。

已处理的路径耦合：

- `app/server/src` 读取 `app/server/assets/schema.sql`、`app/server/assets/installer/installer.html`、`app/server/assets/i18n/locales`。
- `app/server/src/config.ts` 默认读取 `app/admin/dist`。
- `app/server/src/routes/content.ts` 扫描 `app/web/themes`、`app/web/plugins`。
- `app/server/src/static/files.ts` 从 `app/web/public/themes`、`app/server/assets/public`、`app/server/assets/installer/favicon.svg` 提供静态资源。
- `Dockerfile.bun` 分别构建 `app/admin` 和 `app/web`，运行时复制到 `app/admin/dist` 与 `app/web/`。
- 根 `package.json` 已改为 `app/server`、`app/web`、`app/admin` 脚本入口。
- 根 `package.json` 已声明 Bun workspaces：`app/web` 与 `app/admin` 是独立前端子包。
- 子包名已区分：`app/web` 为 `utterlog-web`，`app/admin` 为 `utterlog-admin`。
- `app/web` 和 `app/admin` 仍各自保留 `@/*` 别名，含义不同：`app/web` 指向 `app/web/*`，`app/admin` 指向 `app/admin/src/*`。

建议执行顺序：

后续建议：

1. 继续保留 `app/server`、`app/web`、`app/admin` 的构建边界，避免把三套运行时混进同一个 `src/`。
2. 再考虑依赖合并：当前 `app/web` 与 `app/admin` 有大量重复依赖，但版本不完全一致，例如 React、TypeScript、tailwindcss、tailwind-merge、zod。目录合并后再统一 Bun workspace/依赖版本，风险更低。
3. 将可共享的 API 类型、DTO、常量逐步移动到 `app/shared`。

不建议：

- 不建议把 `app/web/app`、`app/admin/src`、`app/server/src` 直接合成一个 `src/`。Next App Router、Vite SPA 和 Bun server 的运行时、alias、构建产物不同，混放会增加错误面。
- 不建议马上删除 `content/`、`uploads/`。它们是运行时数据根，应保持在仓库根或部署数据卷根，不属于源码目录合并范围。

## 验证记录

- `bun run server:check`
- `bun run build` in `app/web`
- `bun run build` in `app/admin`
- `bun run test:server`
- `bun run build:web`
- `bun run build:admin`
- `bash -n scripts/detect-services.sh install.sh scripts/deploy.sh deploy/site/install.sh`
- `docker compose -f docker-compose.yml config`
- `docker compose -f docker-compose.prod.yml config`
- `DB_PASSWORD=x JWT_SECRET=x docker compose -f deploy/site/docker-compose.yml config`
- `DB_PASSWORD=x JWT_SECRET=x DB_HOST=host.docker.internal docker compose -f docker-compose.prod.yml -f docker-compose.external-db.yml config`
- `docker build -f Dockerfile.bun -t utterlog-bun:deploy-test .`
- Compose deployment smoke test with project `utterlog-bun-deploy-test` on `127.0.0.1:19260`:
  - `GET /api/v1/install/status`
  - `GET /install`
  - `GET /admin/`
  - `POST /api/v1/install/create-admin`
  - `POST /api/v1/install/finish`
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/me`
  - `GET /`
- Setup-only Bun app smoke test on `127.0.0.1:18080`
- Unified Bun app + Next renderer smoke test through Bun proxy
- Rough frontend/admin API string coverage scan against registered Bun routes

未验证：

- Full production TLS reverse proxy with a real public domain.
- Real SMTP/Resend/Sendflare password reset email delivery.
- Cross-site federation with a second live Utterlog instance.
