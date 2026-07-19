# AGENT.md - Utterlog Bun migration reference

This workspace is the active TanStack Start application at `/Users/gentpan/projects/utterlog`.

## Current target architecture

Utterlog is being migrated from the old `postgres + api(Go) + web(Next)` split to:

- Bun TypeScript application gateway/API on one public app port.
- PostgreSQL as the required database.
- TanStack Start + React 19 SSR and file-based routing.
- Vite/React admin built as static assets and served by the Bun app.
- Ephemeral state (captcha, online users, coding cache, reader chat sessions) uses in-process memory only.
- Deployment target is `app + postgres`, or one `app` container when PostgreSQL is external.

## Important directories

```text
app/server/             Bun + TypeScript API/gateway
app/server/assets/schema.sql PostgreSQL bootstrap schema copied from the old API schema
app/admin/              Vite/React admin source
app/web/                Blog pages, themes, and shared React components (Bun SSR source)
content/                Runtime themes/plugins
uploads/                Runtime media uploads
deploy/                 Deployment examples and site installer
scripts/                Operational scripts
```

The old Go backend source has been removed from this migration copy. Do not recreate `api/main.go`, `api/internal`, Go Dockerfiles, or Go `go.mod`.

## Local commands

Use Bun commands for this migration:

```bash
bun run server:check
  bun run start:check
  bun run start:build
bun run build:admin
docker compose -f docker-compose.yml config
docker compose -f docker-compose.prod.yml config
```

For the unified app:

```bash
bun run app/server/src/index.ts
```

Blog SSR + client hydration are served from the single Bun process on `PORT` (default 8080).

## Data and generated directories

Treat these as local/runtime data, not source cleanup targets unless the user explicitly asks:

- `.env`
- `pgdata/`
- `uploads/`
- `uploads/`
- `backup/`
- `ssl/`
- `node_modules/`
- `app/admin/dist/`

The independent `community/`, `id/`, and `wordpress-plugin/` projects live outside this repository under `../utterlog-others/`. `Comment/` remains adjacent/reference material.

## Development rules

- Keep changes inside `/Users/gentpan/projects/utterlog-bun`.
- Prefer Bun and TypeScript for new backend code.
- Keep PostgreSQL-specific behavior; do not force SQLite.
- Keep the admin and web API paths stable across the Bun migration (already completed — do not reintroduce Go handlers or `api/`).
- Update deployment docs and scripts when changing runtime topology.
- Do not remove runtime data or ignored reference projects as part of code cleanup.

不要回滚用户已有改动；只处理当前任务相关文件。

---

## 6. 站点 / 仓库 / 服务对应表

| 域名 | 用途 | 仓库 | 服务 |
|---|---|---|---|
| **用户自己的博客** | 个人站 | `utterlog/utterlog`（本仓库） | 单 docker-compose 全栈 |
| **utterlog.io** | 程序发布站 + install.sh / update.sh 分发 | `utterlog/utterlog-landing`（私有） | 静态 |
| **utterlog.com** | 去中心化网络中心站（Network Hub） | `../utterlog-others/community/` | utterlog-hub :8091 + utterlog-web :3001 |
| **id.utterlog.com** | Utterlog ID 账号中心（OAuth） | `../utterlog-others/id/` | utterlog-id :8090 |
| **docs.utterlog.io** | 文档 | `utterlog/utterlog-docs`（私有） | 静态 |
| **registry.utterlog.io** | Docker 镜像分发（CF 加速 GHCR） | 本仓库 `.github/workflows/docker-publish.yml` | CF |
| **demo.utterlog.io** | 在线演示 | 本仓库部署的一个实例 | 同博客 |

> 不要混淆：用户的博客 ≠ utterlog.com。utterlog.com 是 Network Hub。

---

## 7. 数据库

- PG 18 (pgvector)：本博客库 `utterlog`、Hub 库 `utterlog_hub`、ID 库 `utterlog_id`
- 表前缀 `ul_`（env `DB_PREFIX`），id-center 用 `uid_`
- pgvector 用于语义搜索（embedding 自动生成）
- `app/server/assets/schema.sql` 是真理之源；改 schema 后 `bash scripts/dump-schema.sh` 重新导出，commit 进库
- 文章状态字段：`publish` / `draft` / `private` / `pending`（**不是** `published`）
- 时间字段：`created_at`（草稿创建）/ `published_at`（发布）。所有公开列表/归档/搜索/排序优先用 `published_at`

---

## 8. 主题系统

5 套内置主题（按当前优先级）：

| 主题 | 状态 | 说明 |
|---|---|---|
| **Renascent** | 当前重点 | 学术极简风格，文字驱动首页 + 文章页深度重构（文章编号 / 元信息侧栏 / 目录 / 上下篇 / 相关 / 评论） |
| **Azure** | 历史主主题 | 蓝 `#0052D9`；改 Azure 时只改 Azure 文件 |
| **Flux** | 实验 | 绿 `#00C767`，Stripe Link 风格；HomePage/PostPage/PostCard 待独立实现 |
| **Utterlog** | 旗舰参考 | 默认基线 |
| **Chred** | 备选 | — |

注册位置：`app/web/lib/theme-data.ts`（页面元信息）+ `app/server/src/blog-themes.ts`（后端枚举）。

主题切换：admin → `/admin/themes` → 调用 TanStack Start revalidate 接口清缓存 → 立即生效。
上传 zip：admin 解压到 `content/themes/<name>/`，激活后写 options。
`:root` 默认 CSS 变量已固定为 Azure 蓝，`[data-theme="steel"]` 兜底映射到 Azure，避免 localStorage 残留导致灰色。

**写代码注意**：注释只能提"当前主题"或泛指，**不要写"和某主题保持一致"**。

---

## 9. 设计 Token（admin）

`app/admin/src/styles/globals.css` `:root`：

```css
--ctrl-h-sm: 32px;
--ctrl-h-md: 40px;   /* 默认 input / 工具栏按钮 */
--ctrl-h-lg: 48px;   /* 主 CTA */
--ctrl-pad-sm: 0 12px;
--ctrl-pad-md: 0 18px;
--ctrl-pad-lg: 0 24px;
--ctrl-radius: 0;        /* 全局直角 */
--card-radius: 0;
--card-radius-hero: 0;
```

按钮：`.btn` (= MD) / `.btn-sm` / `.btn-lg` / `.btn-square` + 颜色变体 `.btn-primary | -secondary | -danger | -ghost`（颜色正交）。
Legacy alias 保留：`.btn-toolbar`、`.btn-toolbar-square`、`.btn-dialog`、`.btn-icon`。
Login 页 `.login-form .btn` 自动升级到 LG。

### 9.1 前端设计系统硬规则

Codex 修改前端页面、组件、主题样式时必须遵守以下约束；如果现有代码与本节冲突，优先在当前改动范围内向本节收敛，不做无关重构。

#### Color System

- 必须定义 CSS 变量：`--color-primary`、`--color-secondary`、`--color-neutral-*`、`--color-success`、`--color-warning`、`--color-error`
- 背景只能使用白色 `#ffffff` 或浅灰 `#f8f9fa` / `#f3f4f6`
- 背景和按钮禁止使用渐变
- 任何位置都禁止蓝紫渐变
- 禁止霓虹色、彩虹色盘
- 单个视图最多使用 3 个品牌色
- 文本颜色：主文本 `#111827`，次级文本 `#6b7280`，三级文本 `#9ca3af`

#### Typography

- 字号 scale 固定为：`12px` / `14px` / `16px` / `20px` / `24px` / `32px`
- 必须定义 CSS 变量：`--text-xs` / `--text-sm` / `--text-base` / `--text-lg` / `--text-xl` / `--text-2xl`
- Body：`font-weight: 400`，`line-height: 1.5`
- Heading：`font-weight: 600`，`line-height: 1.25`
- 同一套样式选择一种单位体系（`px` 或 `rem`），不要混用
- 禁止使用定义 scale 之外的任意字号

#### Spacing

- 间距基于 4px 栅格：`4` / `8` / `12` / `16` / `24` / `32` / `48` / `64px`
- 必须定义 CSS 变量：`--space-1` 到 `--space-16`
- 禁止 magic numbers，例如 `13px`、`7px`、`23px`
- 同一组件家族内 padding 必须一致

#### Components

- Card 只能使用 border 或 shadow，不要同时使用
- Shadow level 1：`0 1px 3px rgba(0,0,0,0.08)`
- Shadow level 2：`0 4px 12px rgba(0,0,0,0.1)`
- 圆角只能使用 `6px` 或 `8px`，禁止 `16px+`
- 按钮使用 solid fill，禁止渐变；hover 变暗 10%
- Input 使用 `1px solid #d1d5db`，圆角 `6px`，focus 禁止 glow

#### Icons

- 一个视图内只能一致使用一套图标集：Lucide / Heroicons / Phosphor
- 尺寸：inline 图标 `16px`，独立图标 `20px`
- 禁止用 emoji 作为功能图标

#### Forbidden

- 禁止蓝紫渐变
- 禁止 glassmorphism，除非用户明确要求
- 禁止 emoji 图标
- 禁止给每个元素都加阴影
- 禁止在行内样式里写颜色、间距或排版
- 禁止 magic numbers；所有值必须引用 design token
- 单页最多使用 2 个 shadow depth level

---

## 10. 发布流程

```bash
# 1. 改完代码 + 同步 CHANGELOG.md ## 未发布 → ## [vX.Y.Z]
git add -A && git commit -m "feat(vX.Y.Z): ..."
git push origin main

# 2. 打 tag → 触发 .github/workflows/docker-publish.yml
git tag vX.Y.Z && git push origin vX.Y.Z
#    构建单个应用镜像（Bun 单容器同载网关 + admin + SSR）推到：
#      ghcr.io/utterlog/utterlog-app:{vX.Y.Z, latest, sha-xxx}
#      用户侧另探测 registry.utterlog.io/utterlog/utterlog-app（CF 加速），不可读回退 ghcr

# 3. 创建 GitHub Release（landing changelog 数据源）
gh release create vX.Y.Z --notes "..."
#    标题：仅 vX.Y.Z（无"正式发布"等额外文字）
#    正文：### 新增 / ### 优化 / ### 修复 / ### 移除（中文，不混 Changed/Fixed）
#    不要放升级命令块；不要列 Docker 镜像地址（后台已有一键升级按钮）

# 4. 进 ../utterlog-landing/ 改 package.json version → push → 自动 deploy

# 5. 用户端：一行 curl 升级 / docker compose pull / 后台一键升级
```

**版本号需要同步修改的位置**：

- 根 `package.json`（主版本号；所有 workspace 共享同一版本）
- `app/web/package.json` + `app/admin/package.json`
- `app/server/src/system/metrics.ts` 的 `cachedAppVersion` 运行时兜底常量（**易漏，运行时版本靠它兜底**）
- `bun.lock`（`bun install` 自动重写）

**版本策略**：

- `1.0.0`：历史合并归档（`RELEASE_HISTORY.md`）
- Bun 重写后版本重新从 `1.x` 编号（当前 `1.3.x`），语义化递增
- `1.x.y` patch：同功能线修复 / 小优化
- `1.x.0` minor：完整新功能或主题能力
- 破坏性大改进进入下一个大版本
- （旧 `2.0.x` 线属重写前 Go+Next.js 架构，已归档；其「`2.0.10` 封顶跳 `2.1.0`」规则不再沿用）

**`CHANGELOG.md` 规则**：

- 每次改动完成立刻更新 `## 未发布`，不要等发布前补
- 每个版本固定四段：`### 新增` / `### 优化` / `### 修复` / `### 移除`，没内容写 `暂无。`
- 只写用户能理解的功能变化，不写过细 commit 细节
- 不写 Docker images 列表，不写升级命令块

**构建注意**：

- 镜像：`Dockerfile.bun`（multi-stage，Bun 1.4 base）
- TanStack Start 路由的服务端 loader 在构建期**不能**无条件访问外部 API；必须 gate `INTERNAL_API_URL`，否则 prerender 可能重复等待

---

## 11. 用户安装路径

```bash
# 一行安装（已有反代）
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | bash

# 带自动 HTTPS（无现成反代）
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | DOMAIN=blog.x.com bash

# 复用宿主机 PostgreSQL（1Panel / 宝塔常见）
UTTERLOG_DB_MODE=external curl -fsSL https://...install.sh | bash
```

`install.sh` 自动：检查 Docker → clone → 按内存选本地 build / 拉 GHCR → 生成随机 `DB_PASSWORD` `JWT_SECRET` → 找空闲端口（默认 9260，被占顺延）→ 启动 → 健康检查。

升级 = 同一行 curl 命令再跑一次（在 `utterlog/` 上一级目录），脚本检测到目录已存在自动 `git pull` + 重部署。

---

## 12. 生产服务器（参考 / 对应 memory）

**hz-utterlog (116.202.171.136)** — Hetzner，承载全部 .com / .io 子域

- SSH alias：`hz-utterlog`（key `~/.ssh/gentpan.pem`）
- 反代：1Panel OpenResty Docker 容器 `1Panel-openresty-V6vW`
- 站点 conf：`docker exec 1Panel-openresty-V6vW cat /www/conf.d/{utterlog.io,utterlog.com,id.utterlog.com,docs.utterlog.io,registry.utterlog.io}.conf`
- 静态根：host `/opt/1panel/1panel/www/wwwroot/` ↔ container `/www/wwwroot/`
- systemd：`utterlog-api` (8081) / `utterlog-hub` (8091) / `utterlog-id` (8090) / `utterlog-web` (3001)
- 二进制：`/www/wwwroot/utterlog.com/api/utterlog-api`
- DB：PostgreSQL 18 (Docker pgvector)；本项目不依赖 Redis

**xifeng.net (43.161.221.122)** — Utterlog 单容器 Bun 部署点，Debian 13

- SSH：复用 `~/.ssh/gentpan.pem` 直连 `root@43.161.221.122`（host key 偶尔轮换，重新 `ssh-keyscan` 即可）
- 部署目录：`/opt/utterlog-xifeng`
- Compose：`docker-compose.bun.yml` (app) + `docker-compose.infra.yml` (postgres)，网络 `utterlog_default`
- App 容器：`utterlog-xifeng-app`，镜像 `utterlog-app:local`（Bun 1.4 base + 源码构建，tag 是 `local` 不是 release tag，**版本比对要看源码 hash，不要只看 tag**）
- 端口：`127.0.0.1:9261` → 容器 8080（仅 loopback，反代由 host 自行处理）
- DB：独立 compose，`utterlog-postgres-1` (utterlog-postgres:19beta1-pgvector)，5432
- 备份镜像：`backup-YYYYMMDDhhmmss` 形式保留在本地 registry
- 源码版本核对：容器内 `cat /app/.deploy-revision` 应对齐 `git rev-parse HEAD`；部署用 `make deploy-xifeng`（见 `deploy/xifeng/README.md`）

**pancn.com (3.71.15.157)** — AWS EC2 t3.xlarge 法兰克福，Debian 13

- 仅 1Panel + PG/Redis/OpenResty，未跑 utterlog
- SSH：`ssh -i ~/Downloads/panaws.pem admin@3.71.15.157`

部署 secrets（GH Actions）：`UTTERLOG_DEPLOY_SSH_KEY`、`UTTERLOG_DEPLOY_HOST=116.202.171.136`，三仓库共用，path secret 各异。

CDN：`bluecdn.com` 系列（jsd / cdnjs / fonts / gravatar / ico / icons）。

> 用户自己的博客实例可能部署在 OVH 或其他服务器；没有用户明确提供时，不要假设 `/www/wwwroot/...` 就是目标站点配置。

---

## 13. 外部账号 / 凭据（敏感数据看 memory）

| 资源 | memory 文件 | 说明 |
|---|---|---|
| Cloudflare（两账号） | `reference_cloudflare.md` | `403010@qq.com` / `gentpan@gmail.com`；utterlog.com zone `a76c9be...`；约定：CF Origin Cert 15 年 / SSL Full(Strict) / 关 IPv6+ECH / 橙云 |
| R2 `utterlog-static` | `reference_r2_utterlog_static.md` | 系统级静态资源（FA / 字体）；公开域名 `static.utterlog.com`；必备 header `Cache-Control: public, max-age=31536000, immutable` + `Access-Control-Allow-Origin: *` |
| AWS EC2 法兰克福 | `reference_aws_ec2.md` | pancn.com 3.71.15.157 |
| 服务器 SSH / 部署路径 | `user_infra.md` | hz-utterlog 全部 systemd 服务 + OpenResty 容器路径 |
| OpenClaw 服务器（旁支项目） | `reference_openclaw_server.md` | OVH 法国 149.202.94.166；非 utterlog，但同台账号会用到 |
| Utterlog ID OAuth | `reference_utterlog_id.md` | GitHub/Google callback 在 id.utterlog.com；表前缀 `uid_` |

memory 索引在 `~/.claude/projects/-Users-gentpan-projects-utterlog/memory/MEMORY.md`，**不要把里面的 API Key / Secret 复制到任何代码或文档里**。

---

## 14. AI 协作约定（硬规则，来自 feedback memory）

写代码 / 提交 / 输出文本时一律遵守：

1. **不加 `Co-Authored-By: Claude`** 到任何 git commit。Contributors 只显示用户。
2. **AI 输出禁 emoji**。所有 AI prompt 加"禁止 emoji"指令；前端 `stripEmoji` 过滤。
3. **代码注释禁提其他主题名**（不要写"和 OneBlog 一致"之类）。注释只描述功能。
4. **Docker compose 优先**，不建议 `npm run dev` / `go run`。
5. **图标遵守 §9.1 前端设计系统硬规则**：单个视图内只用一套图标集（Lucide / Heroicons / Phosphor）。维护既有 FontAwesome 视图时不要混入第二套图标。
6. **地图用 Mapbox GL JS**，不要尝试 PixiJS 像素地图（之前调坏过）。
7. **不发 preview screenshot**。编译通过 + console 无报错就告知用户测试，让用户自己截图反映现象。
8. **Release notes** 不要含升级命令块（`bash update.sh` / `docker compose pull` 等都别放），后台已有一键升级按钮，重复就是冗余。
9. **段落点评 Azure 主题外层 overflow** 可能裁切 `-40px` 触发按钮；遇到给 `article` 加 `padding-left: 48px`。
10. **会话接近 90% 上下文时主动写 memory**，并给出下次会话提示词。
11. **不重新设计 / 不重构**：仅修复用户当前任务相关文件，不要扩大改动范围。

---

## 15. 常用文件速查

### Server 路由（`app/server/src/routes/`）

| 模块 | 文件 |
|---|---|
| 路由注册 / 网关 | `index.ts` `api.ts` |
| 认证 / 安全 | `auth.ts` `security.ts` |
| 内容 CRUD | `content.ts` |
| 安装 / 升级 | `install.ts` |
| 评论 / 互动 | `footprints.ts` |
| AI | `ai.ts` |
| 备份 / 维护 | `backup.ts` |
| 网络 / 联邦 | `telegram.ts` |
| 第三方 | `coding.ts` |
| WordPress 兼容 | `compat.ts` |
| 插件 / 扩展 | `extensions.ts` |

### 前后端关键路径

| 功能 | 路径 |
|---|---|
| Server 入口 | `app/server/src/index.ts` |
| Server 配置 / 启动配置校验 | `app/server/src/config.ts` |
| DB 客户端 / helpers / options | `app/server/src/db/{client,helpers,options}.ts` |
| Auth（JWT / 中间件 / 重置） | `app/server/src/auth/{jwt,middleware,password-reset}.ts` |
| 邮件 | `app/server/src/email.ts` + `app/server/src/email/comment-reply-unsubscribe.ts` |
| GeoIP | `app/server/src/geoip.ts` |
| Bot 检测 | `app/server/src/bot-detect.ts` |
| Analytics rollup | `app/server/src/analytics/rollup.ts` |
| Web 渲染（SSR / router / 独立渲染 / page runner / 安装门控） | `app/server/src/web/{render,render-standalone,router,page-runner,install-gate}.tsx` |
| HTTP 工具（response / security / validation / public-url） | `app/server/src/http/{response,security,validation,public-url}.ts` |
| Cache（revalidate / tagged） | `app/server/src/cache/{revalidate,tagged}.ts` |
| 媒体（storage / favicon） | `app/server/src/media/{storage,favicon}.ts` |
| Telegram | `app/server/src/telegram.ts` |
| 天气 | `app/server/src/weather.ts` |
| Sync worker | `app/server/src/sync/worker.ts` |
| 系统（host / metrics） | `app/server/src/system/{host,metrics}.ts` |
| 主题注册（后端枚举 / 旧 option 迁移） | `app/server/src/blog-themes.ts` + `app/server/src/blog-theme-options.ts` |
| Admin 入口 | `app/admin/src/main.tsx` + `app/admin/src/App.tsx` |
| Admin API 客户端 | `app/admin/src/lib/api.ts` |
| Admin 设计 token / 全局样式 | `app/admin/src/styles/globals.css` |
| Admin 通用 UI | `app/admin/src/components/ui/*` |
| Admin 关键页面 | `app/admin/src/pages/{DashboardHome,Comments,Posts,Settings,Plugins,Themes,Backup,MusicPlaylists,Analytics,Assistant,AiLogs,AiSettings,...}.tsx` |
| TanStack Start 入口 | `app/start/src/` |
| Web 页面组件 | `app/web/components/pages/` |
| Web 主题源码 | `app/web/themes/{Utterlog,Azure,Flux,Nebula,Renascent}/` |
| Web 设计 token / 全局样式 | `app/web/globals.css` |
| Web 组件（blog 业务 / UI / icons / editor） | `app/web/components/{blog,ui,icons,editor}/` |
| Web Lib | `app/web/lib/{api,store,theme,theme-context,theme-data,...}.ts(x)` |
| 跨包共享 | `app/shared/{blog-theme,site-favicon,string-utils}.ts` |
| Schema | `app/server/assets/schema.sql` |
| Docker dev / prod | `Dockerfile.bun` + `docker-compose.yml` / `docker-compose.prod.yml` |
| 部署脚本 | `scripts/deploy.sh` / `install.sh` |
| 主题样式同步 | `app/web/scripts/sync-theme-styles.mjs` |

---

## 16. 已知坑 / 历史教训

1. **文章状态字段** `publish` 不是 `published`。AI prompt 写错过导致查到 0 篇。
2. **发布时间** 优先用 `published_at`（不是 `created_at`）；草稿首发要写入当前时间，不能直接套草稿创建时间。`datetime-local` 输入按站点时区解析。
3. **Slug 唯一约束** 草稿和正式文章共用同表，草稿首发时可能撞 slug，要单独处理。
4. **缓存失效**：保存主题菜单 / 站点设置 / 主题切换 / Coding 设置 / 关于页模板后要调用当前 revalidate 接口，否则前台可能仍显示旧数据。
5. **构建期 chunk 失效**：保留错误边界和有限重试，避免无限刷新。
6. **Admin 缓存策略**：`index.html` 设 `no-cache`，`assets/*.js` 设 `immutable`。
7. **AI 陪读头像** 优先 admin 个人 `avatar`（非 gravatar_url）。
8. **所有邮件**（含验证码）站点品牌化，footer 保留 "Powered by Utterlog"。
9. **`docker-compose.prod.yml` 里 `${X:?required}`** 会卡死 setup wizard（compose 拒绝启动），生产应改 `${X:-}` 允许空。
10. **生产 `Dockerfile.prod`** 需要 `.env` bind mount（`- ./.env:/app/.env:rw`）才能让 setup 写入的配置在重启后被读到。
11. **dev `./api:/app` bind mount**，setup 写 `.env` 落到 host `api/.env` 而非根 `.env` —— `findEnvPath` 已覆盖。
12. **id-center 新 passkey** 需 `residentKey: required` 才支持 discoverable login；老 passkey 失效需重新注册。
13. **Network Hub SSR** 用 `INTERNAL_API_URL`，浏览器侧用 `/api/v1` 相对路径（hub JWT 不能从浏览器直连 :8091）。源码位于 `../utterlog-others/community/`。
14. **位置反查失败** 不要直接把经纬度写入位置字段，要提示用户手动填位置（2.0.7 修复）。
15. **段落点评 Azure 外层 overflow** 可能裁切 `-40px` 触发按钮 → article `padding-left: 48px`。
16. **AI 错误透传**：保存 / 状态切换失败时把后端原因带回前台，不要只显示通用错误。
