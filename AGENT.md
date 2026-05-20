# AGENT.md — Utterlog AI 开发参考

> 本仓库公开（`utterlog/utterlog`，MIT）。AI 助手每次进入工作区先读这一份。
> 敏感凭据（CF API Key / R2 / SSH 私钥等）**不写在本文档**，参考 memory + `.env`。
>
> 当前版本：**2.2.0**（2026-05-05 已发布）。最新本地改动写在 `CHANGELOG.md` 的 `## 未发布`。

---

## 1. 项目是什么

Utterlog = 独立作者的一体化内容平台。单二进制 + 单端口 + Docker Compose 部署。

- 用户的博客本身基于本仓库部署
- 通过 OAuth 联盟身份接入 utterlog.com（Network Hub）
- 程序发布、文档、镜像分发各有独立站点（见 §6）

---

## 2. 顶层架构

```
浏览器
  │ 443 (你的 nginx / 1Panel / Caddy)
  ▼
127.0.0.1:9260   ← Utterlog 唯一对外端口（loopback）
  │
  ├─ /admin/*    Vite + React SPA（go:embed 进 Go 二进制）
  ├─ /api/v1/*   Go + Gin handlers
  ├─ /uploads/*  本地 / S3 / R2
  └─ /*          反代到内网 web:3000（Next.js SSR 博客）
```

- 公网仅一个端口，loopback 绑定 `127.0.0.1:9260`，必须前置反代
- 生产内存 ~600MB，1GB VPS 舒适跑
- Go binary ~25MB · Next.js standalone ~150MB

---

## 3. 仓库结构

```
utterlog/                         # 本仓库根
├── api/                          # Go 后端 + 内嵌 admin SPA
│   ├── main.go                   # 入口；DB 连不上时进 setup-only 模式
│   ├── admin.go                  # //go:embed all:admin/dist
│   ├── admin_embed.go            # br/gz/identity 协商响应
│   ├── theme_assets.go           # 主题静态资源 handler
│   ├── web_proxy.go              # /* 反代到 Next.js
│   ├── config/
│   │   ├── database.go           # InitDB() 返回 error，不 log.Fatal
│   │   ├── config.go             # godotenv.Overload()
│   │   └── redis.go
│   ├── internal/
│   │   ├── handler/              # 50+ HTTP handler，每模块一个文件（见 §15）
│   │   ├── email/                # templates.go + tpl/*.html，7 个站点品牌邮件模板
│   │   ├── storage/              # storage.go 抽象 local / S3 / R2
│   │   ├── middleware/           # auth / cors / logger
│   │   └── model/
│   ├── migrations/               # 增量迁移
│   ├── schema.sql                # 首次启动自动加载（loadSchemaIfFresh）
│   ├── themes/                   # 主题元数据（运行时；上传主题去 content/themes）
│   ├── plugins/                  # 上传插件解压目录（运行时；同上 content/plugins）
│   ├── public/                   # 静态资源
│   ├── admin/                    # 管理后台 SPA 源码
│   │   ├── src/
│   │   │   ├── pages/            # 40+ 页面（React Router 懒加载）
│   │   │   ├── layouts/          # DashboardLayout / PostsLayout
│   │   │   ├── components/       # ui/ + form/FormC + layout/Sidebar 等
│   │   │   ├── lib/              # api.ts / site.ts
│   │   │   └── styles/globals.css # Plan A 设计 token
│   │   └── dist/                 # vite build 产物，go:embed 来源
│   ├── Dockerfile                # 开发
│   ├── Dockerfile.prod           # 生产（多阶段 + linux/amd64）
│   └── Makefile
│
├── web/                          # Next.js 16 博客前台（开源主题 + 插件生态）
│   ├── app/                      # App Router（含 /install）
│   ├── components/blog/          # LazyImage / ImageGrid 等
│   ├── themes/                   # Utterlog / Azure / Renascent / Flux / Chred
│   ├── public/themes/            # 主题动态 styles.css（sync:themes 同步）
│   ├── lib/theme.ts              # 主题注册表
│   ├── middleware.ts             # /install 重定向、未安装拦截
│   ├── plugins/                  # 前端插件
│   └── scripts/sync-theme-styles.mjs
│
├── id/                           # id.utterlog.com 源码（独立服务，passkey/social/totp/oauth）
│
├── community/                    # utterlog.com Network Hub（独立服务）
│   ├── api/                      # utterlog-hub Go binary
│   └── web/                      # utterlog-web Next.js
│
├── content/                      # 上传内容运行时根
│   ├── themes/                   # 用户上传主题解压目录（统一在这里）
│   └── plugins/                  # 用户上传插件解压目录
├── uploads/                      # 媒体上传（local 模式落盘点）
├── deploy/                       # 反代示例：1panel.md / nginx.conf.example / Caddyfile.example / caddy/
├── scripts/                      # deploy.sh / dump-schema.sh / setup-pgvector.sh / detect-services.sh / find-free-port.sh
├── locales/                      # i18n 文案
├── Comment/                      # 历史评论组件（保留，未拆仓）
├── docker-compose.yml            # dev：单端口 9260 + bind mount + 实时改
├── docker-compose.prod.yml       # 生产：拉镜像 + 健康检查
├── docker-compose.external-{db,redis}.yml  # 复用宿主机服务的 overlay
├── docker-compose.pull.yml       # 强制拉 GHCR 镜像
├── install.sh                    # 一行 curl 安装脚本
├── deploy.sh                     # 链接到 scripts/deploy.sh
├── Makefile                      # make deploy / make update / make schema
├── CHANGELOG.md                  # 必读：每次改动立即更新 ## 未发布
├── RELEASE_HISTORY.md            # 1.0.0 之前历史归档
└── .env / .env.example
```

> 子仓库（不在本仓库）：
> - `utterlog/utterlog-landing`（私有）→ utterlog.io 落地页 + install.sh 分发，本地 `/Users/gentpan/projects/utterlog-landing/`
> - `utterlog/utterlog-docs`（私有）→ docs.utterlog.io，本地 `/Users/gentpan/projects/utterlog-docs/`
>
> 主仓库根目录的 `landing/` `docs/` 已加 `.gitignore`，不要往里写文件。

---

## 4. 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Go 1.26 + Gin + sqlx |
| 管理后台 | Vite 6 + React 19 + React Router 7 + Zustand + Tailwind 4 |
| 博客前端 | Next.js 16 + React 19 + TypeScript 5 + Milkdown 编辑器 |
| 数据 | PostgreSQL 18 (pgvector) + Redis 8 |
| 媒体 | local / S3 / Cloudflare R2 + 自动 WebP + EXIF（goexif） |
| 认证 | JWT + 2FA TOTP + Passkey/WebAuthn（含 discoverable login） |
| AI | OpenAI / Claude / DeepSeek / Gemini，function-calling 工具集 |
| 图标 | FontAwesome Pro 7.2（CDN：`https://icons.bluecdn.com/fontawesome-pro/css/all.min.css`） |
| 地图 | Mapbox GL JS（**不要**自建 PixiJS 像素图）；高德/腾讯位置服务作国内兜底 |
| 部署 | Docker Compose + 可选内置 Caddy |

---

## 5. 本地开发

**全部走 docker compose**，**不要** `npm run dev` / `go run .`。

```bash
# 启动全部服务（postgres / redis / api / web）
docker compose up -d --build

# 改 Go 后端
docker compose restart api
# 改了依赖
docker compose up -d --build api

# 改前端 web/
docker compose up -d --build web

# 改主题 styles.css 后，同步到 public 主题资源
cd web && npm run sync:themes

# 改 admin SPA（先 build dist 让 Go 重新 embed）
cd api/admin && npm run build && cd ../.. && docker compose restart api

# 看日志
docker compose logs -f api
docker compose logs -f web
```

数据持久化：`./pgdata` `./redisdata`，`docker compose down` 不丢数据；`down -v` 才会删 volume。

**端口**：浏览器访问 `http://localhost:9260`（同生产架构）。

**.env 位置**：项目根 `/Users/gentpan/projects/utterlog/.env`。`config.Load()` 用 `godotenv.Overload()`，会覆盖 compose `environment:` 块。

**双阶段启动**：DB 连不上时 `main.go` 进 setup-only 模式，仅暴露 `/admin/setup` + `/api/v1/setup/*`，其它 503。安装向导写完 `.env` 后 `os.Exit(0)`，docker `restart: unless-stopped` 拉起来读新配置。

### 本地构建检查

按改动范围选择最小构建：

```bash
cd web && npm run build              # 博客前台 / 主题 / Next.js
cd api/admin && npm run build        # 管理后台
docker compose up -d --build api web # 后端 Docker 构建（最常用验证方式）
```

注意：`web npm run build` 会改写 `web/next-env.d.ts` 的 routes 引用，commit 前恢复为：

```ts
import "./.next/dev/types/routes.d.ts";
```

不要把 `.next/types/routes.d.ts` 这类构建期路径带进提交。

### 主题开发

- 主题源码：`web/themes/<Theme>/`
- 主题静态资源：`web/public/themes/<Theme>/`
- 改 `styles.css` 后必须执行 `cd web && npm run sync:themes`
- 新增内置主题必须同时注册：
  - `web/lib/theme.ts`（imports + `themeComponents` + `themeManifests`）
  - `api/internal/handler/extensions.go` 的 `builtInThemes`
- 上传主题运行时目录统一为 `content/themes/<id>/`，不要再写入 api/web 两套重复目录
- 菜单位置由主题 `theme.json` 声明；只有 Azure 固定 Hero 分类侧栏，其他主题不要复用 Azure 的菜单侧栏逻辑

---

## 5.1 当前开发进度（2026-05-03）

**最近发布版本**：`2.0.7`（2026-05-02）。`## 未发布` 当前只有一项：优化前台列表型链接预取策略，减少 Next.js `_rsc` 预加载请求。

近 4 个版本（2.0.4 → 2.0.7）功能落点：

- **Coding/GitHub 内置页面**（2.0.4 / 2.0.6）：从社交链接自动识别 GitHub，可单独配置用户名；GraphQL 贡献统计 + Token 配置；Hero 间距优化；Redis 持久缓存 + 过期数据立即返回 + 后台刷新 + 保存设置即清缓存。
- **菜单与 options 缓存修复**（2.0.5）：保存主题菜单 / 站点设置后会转发 `/api/revalidate` 到 Next.js，前台立即生效。
- **数据库清理工具**（2.0.6）：后台一键清理媒体缺失文件、失效相册关联、孤儿文章关联、孤儿评论、足迹残留、过期授权。
- **地理服务**（2.0.7）：第三方服务设置加高德 / 腾讯位置服务 Key；同源位置反查接口，说说定位优先后端 Mapbox 解析城市，国内可用高德 / 腾讯兜底；前台反查失败时不再写经纬度，提示手动填位置。
- **草稿与发布时间修复**（2.0.7）：草稿首发时 slug 唯一约束冲突 / 分类标签关联丢失 / 发布时间被覆盖为草稿创建时间 / `datetime-local` 时区解析 / `published_at` 错写未发布草稿 / 公开列表归档归档日期搜索仍按草稿创建时间排序——全部统一改为优先使用发布时间。
- **后台 UX**：Markdown 编辑器代码按钮区分行内/代码块；说说来源 `local/web/browser` 统一显示 `网页`；关于页面模板与自定义 Markdown 严格互斥并刷新 `/about` 缓存；保存失败错误提示透传后端原因；新建文章从 H1 自动识别标题。

每次继续开发前先看：

```bash
git status --short
sed -n '1,80p' CHANGELOG.md
```

不要回滚用户已有改动；只处理当前任务相关文件。

---

## 6. 站点 / 仓库 / 服务对应表

| 域名 | 用途 | 仓库 | 服务 |
|---|---|---|---|
| **用户自己的博客** | 个人站 | `utterlog/utterlog`（本仓库） | 单 docker-compose 全栈 |
| **utterlog.io** | 程序发布站 + install.sh / update.sh 分发 | `utterlog/utterlog-landing`（私有） | 静态 |
| **utterlog.com** | 去中心化网络中心站（Network Hub） | 本仓库 `community/` | utterlog-hub :8091 + utterlog-web :3001 |
| **id.utterlog.com** | Utterlog ID 账号中心（OAuth） | 本仓库 `id/` | utterlog-id :8090 |
| **docs.utterlog.io** | 文档 | `utterlog/utterlog-docs`（私有） | 静态 |
| **registry.utterlog.io** | Docker 镜像分发（CF 加速 GHCR） | 本仓库 `.github/workflows/docker-publish.yml` | CF |
| **demo.utterlog.io** | 在线演示 | 本仓库部署的一个实例 | 同博客 |

> 不要混淆：用户的博客 ≠ utterlog.com。utterlog.com 是 Network Hub。

---

## 7. 数据库

- PG 18 (pgvector)：本博客库 `utterlog`、Hub 库 `utterlog_hub`、ID 库 `utterlog_id`
- 表前缀 `ul_`（env `DB_PREFIX`），id-center 用 `uid_`
- pgvector 用于语义搜索（embedding 自动生成）
- `api/schema.sql` 是真理之源；改 schema 后 `bash scripts/dump-schema.sh` 重新导出，commit 进库
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

注册位置：`web/lib/theme.ts` + `api/internal/handler/extensions.go`（`builtInThemes`）。

主题切换：admin → `/admin/themes` → 调 Next.js `/api/revalidate` 清缓存 → 立即生效。
上传 zip：admin 解压到 `content/themes/<name>/`，激活后写 options。
`:root` 默认 CSS 变量已固定为 Azure 蓝（`web/app/globals.css`），`[data-theme="steel"]` 兜底映射到 Azure，避免 localStorage 残留导致灰色。

**写代码注意**：注释只能提"当前主题"或泛指，**不要写"和某主题保持一致"**。

---

## 9. 设计 Token（admin）

`api/admin/src/styles/globals.css` `:root`：

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

---

## 10. 发布流程

```bash
# 1. 改完代码 + 同步 CHANGELOG.md ## 未发布 → ## [vX.Y.Z]
git add -A && git commit -m "feat(vX.Y.Z): ..."
git push origin main

# 2. 打 tag → 触发 .github/workflows/docker-publish.yml
git tag vX.Y.Z && git push origin vX.Y.Z
#    构建镜像推到：
#      registry.utterlog.io/utterlog/utterlog-{api,web}:{vX.Y.Z, latest, sha-xxx}
#      ghcr.io/utterlog/utterlog-{api,web}:...

# 3. 创建 GitHub Release（landing changelog 数据源）
gh release create vX.Y.Z --notes "..."
#    标题：仅 vX.Y.Z（无"正式发布"等额外文字）
#    正文：### 新增 / ### 优化 / ### 修复 / ### 移除（中文，不混 Changed/Fixed）
#    不要放升级命令块；不要列 Docker 镜像地址（后台已有一键升级按钮）

# 4. 进 ../utterlog-landing/ 改 package.json version → push → 自动 deploy

# 5. 用户端：一行 curl 升级 / docker compose pull / 后台一键升级
```

**版本号需要同步修改的位置**：

- `web/package.json` + `web/package-lock.json`
- `api/admin/package.json` + `api/admin/package-lock.json`
- `api/main.go`（健康检查 `2.0.7-go`）
- `api/internal/handler/install.go`（安装接口 `2.0.7`）

**版本策略**：

- `1.0.0`：历史合并归档（`RELEASE_HISTORY.md`）
- `2.0.0`：发布基线
- `2.0.x`：同功能线修复 / 小优化；**到 `2.0.10` 为本周期上限，下一次发版必须跳到 `2.1.0`，不再继续 `2.0.11`**
- `2.x.0`：完整新功能或主题能力
- 破坏性大改进入下一个大版本

**`CHANGELOG.md` / GitHub Release 规则**：

- 每次改动完成立刻更新 `## 未发布`，不要等发布前补
- 每个版本固定四段：`### 新增` / `### 优化` / `### 修复` / `### 移除`，没内容写 `暂无。`
- 只写用户能理解的功能变化，不写过细 commit 细节
- 不写 Docker images 列表，不写升级命令块
- **只写代码变更**：服务器迁移 / IP 变动 / TLS 证书 / certbot / DNS / nginx 反代 / git 历史重写（filter-branch、Co-Authored-By trailer 清理、retag、force-push）/ 手动跑过的一次性 SQL / 个人服务器诊断 / 仓库管理凭据这些**全部不写**进 CHANGELOG 或 release notes，放运维笔记本。判断口径：用户拉新镜像后能感知的程序行为变化才进，否则属于 ops。
- GitHub release 标题只写 `vX.Y.Z`，正文不要含 `### 镜像` 空段、不要重复"通过后台升级按钮直接拉取本版本镜像"这种 CTA 套话

**构建注意**：

- Go 二进制需 `--platform linux/amd64`（CGO + libwebp，glibc）
- 不要再找 `api/Dockerfile.build`（已删）；用 `api/Dockerfile.prod` 的 `--target go-builder` 取 `/out/utterlog-api`
- `web/app/layout.tsx` 的 `generateMetadata` 在构建期**不能**直接调 API；必须 gate `INTERNAL_API_URL`，否则 prerender 挂 60s × 3 重试

---

## 11. 用户安装路径

```bash
# 一行安装（已有反代）
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | bash

# 带自动 HTTPS（无现成反代）
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | DOMAIN=blog.x.com bash

# 复用宿主机 PG / Redis（1Panel / 宝塔常见）
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
- DB：PostgreSQL 18 (Docker pgvector) / Redis 8.6.2 (Docker, 1Panel)

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
5. **图标只用 FontAwesome**，不引入 Lucide。`<i className="fa-solid fa-xxx" />` 或 `fa-regular` / `fa-light`。
6. **地图用 Mapbox GL JS**，不要尝试 PixiJS 像素地图（之前调坏过）。
7. **不发 preview screenshot**。编译通过 + console 无报错就告知用户测试，让用户自己截图反映现象。
8. **Release notes** 不要含升级命令块（`bash update.sh` / `docker compose pull` 等都别放），后台已有一键升级按钮，重复就是冗余。
9. **段落点评 Azure 主题外层 overflow** 可能裁切 `-40px` 触发按钮；遇到给 `article` 加 `padding-left: 48px`。
10. **会话接近 90% 上下文时主动写 memory**，并给出下次会话提示词。
11. **不重新设计 / 不重构**：仅修复用户当前任务相关文件，不要扩大改动范围。

---

## 15. 常用文件速查

### Go handler（`api/internal/handler/`）

| 模块 | 文件 |
|---|---|
| 认证 / 安全 | `auth.go` `passkey.go` `totp.go` `password_reset.go` `security.go` `botdetect.go` `passport.go` |
| 内容 CRUD | `post.go` `category.go` `crud.go` `content.go` `permalink.go` `import.go` `seo.go` |
| 媒体 | `media.go` `media_parse.go` `media_sync.go` `album.go` |
| AI | `ai.go` `agent.go` `ai_comment.go` `ai_image.go` `ai_prompts.go` `annotation.go` |
| 安装 / 升级 | `install.go` `installer.go` `installer.html` `setup.go` `system_version.go` `extensions.go` |
| 评论 / 互动 | `footprint.go` `analytics.go` `analytics_purge.go` `rebuild_stats.go` |
| 网络 / 联邦 | `network.go` `federation.go` `telegram.go` |
| 第三方 | `coding.go` `weather.go` `geocode.go` `search.go` `i18n.go` |
| 备份 / 维护 | `backup.go` `database_cleanup.go` |
| WordPress 同步 | `sync_wp.go` `sync_wp_import.go` `sync_wp_worker.go` |
| 统计 | `stats.go` |

### 前后端关键路径

| 功能 | 路径 |
|---|---|
| HTTP 路由入口 | `api/main.go` |
| go:embed admin | `api/admin.go` `api/admin_embed.go` |
| 反代 Next.js | `api/web_proxy.go` |
| 邮件模板 | `api/internal/email/templates.go` + `tpl/*.html` |
| AI Agent 工具 | `api/internal/handler/agent.go` |
| AI 批量任务 | `api/internal/handler/ai.go` (`AIBatchQuestions/Summary/All`) |
| 安装向导 | `api/internal/handler/setup.go` + `api/admin/src/pages/Setup.tsx` |
| 创建管理员 | `api/internal/handler/install.go` + `web/app/install/page.tsx` |
| 主题注册 | `web/lib/theme.ts` + `api/internal/handler/extensions.go` |
| 主题源码 | `web/themes/{Utterlog,Azure,Renascent,Flux,Chred}/` |
| 设计 token | `api/admin/src/styles/globals.css` |
| FormC | `api/admin/src/components/form/FormC.tsx` |
| Sidebar | `api/admin/src/components/layout/Sidebar.tsx` |
| Admin API 客户端 | `api/admin/src/lib/api.ts` |
| 媒体存储抽象 | `api/internal/storage/storage.go` |
| Schema | `api/schema.sql` |
| Docker dev / prod | `docker-compose.yml` / `docker-compose.prod.yml` |
| 部署脚本 | `scripts/deploy.sh` / `install.sh` |
| Sync 主题 styles | `web/scripts/sync-theme-styles.mjs` |

---

## 16. 已知坑 / 历史教训

1. **文章状态字段** `publish` 不是 `published`。AI prompt 写错过导致查到 0 篇。
2. **发布时间** 优先用 `published_at`（不是 `created_at`）；草稿首发要写入当前时间，不能直接套草稿创建时间。`datetime-local` 输入按站点时区解析。
3. **Slug 唯一约束** 草稿和正式文章共用同表，草稿首发时可能撞 slug，要单独处理。
4. **`/api/revalidate` 必须转发**：保存主题菜单 / 站点设置 / 主题切换 / Coding 设置 / 关于页模板都要 POST `/api/revalidate` 清 Next.js 缓存，否则前台仍是旧数据。
5. **Next.js rebuild 期 chunk 失效** → `ChunkErrorBoundary` + sessionStorage 限流自动硬刷。
6. **Admin 缓存策略**：`index.html` 设 `no-cache`，`assets/*.js` 设 `immutable`。
7. **AI 陪读头像** 优先 admin 个人 `avatar`（非 gravatar_url）。
8. **所有邮件**（含验证码）站点品牌化，footer 保留 "Powered by Utterlog"。
9. **`docker-compose.prod.yml` 里 `${X:?required}`** 会卡死 setup wizard（compose 拒绝启动），生产应改 `${X:-}` 允许空。
10. **生产 `Dockerfile.prod`** 需要 `.env` bind mount（`- ./.env:/app/.env:rw`）才能让 setup 写入的配置在重启后被读到。
11. **dev `./api:/app` bind mount**，setup 写 `.env` 落到 host `api/.env` 而非根 `.env` —— `findEnvPath` 已覆盖。
12. **id-center 新 passkey** 需 `residentKey: required` 才支持 discoverable login；老 passkey 失效需重新注册。
13. **`community/web` SSR** 用 `INTERNAL_API_URL`，浏览器侧用 `/api/v1` 相对路径（hub JWT 不能从浏览器直连 :8091）。
14. **位置反查失败** 不要直接把经纬度写入位置字段，要提示用户手动填位置（2.0.7 修复）。
15. **段落点评 Azure 外层 overflow** 可能裁切 `-40px` 触发按钮 → article `padding-left: 48px`。
16. **AI 错误透传**：保存 / 状态切换失败时把后端原因带回前台，不要只显示通用错误。
