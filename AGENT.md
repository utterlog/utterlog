# AGENT.md — Utterlog 架构参考

仓库根目录就是当前在跑的 TanStack Start 应用。

> **写这份文档的原则**：只记不变量和判断规则。会变的事实（版本号、文件数量、
> 目录清单）一律指向真源，不要抄成快照——2026-08-08 的一次全面核对发现 66 处
> 失准，其中约六成的根因都是「把一个会变的事实写死了」。

---

## 1. 目标架构

- Bun + TypeScript 单进程网关 / API，对外只开一个端口。
- PostgreSQL（必需）+ **pgvector 扩展（硬依赖）**。schema 里有 `vector(1536)` 列和
  hnsw 索引，缺扩展则整个 schema 导入失败。本地用 `scripts/setup-pgvector.sh` 装。
- TanStack Start + React 19，SSR + 文件式路由。
- Admin 是 **TanStack Start 的 SPA 模式**（无 SSR，预渲染一个静态壳，Bun 网关对
  所有 `/admin/*` 返回它，再由客户端 router 水合）。产物是 `dist/client` +
  `dist/server` 两层，Bun 读 `app/admin/dist/client`。
- 临时状态（验证码、在线访客、陪读会话）只用进程内内存，不依赖 Redis。
- 部署形态：systemd 托管的 Bun 进程 + 本机或外部 PostgreSQL。**不用 Docker**
  （仓库里没有任何 Dockerfile）。

旧的 Go 后端已删除。不要重建 `api/main.go`、`api/internal` 或任何 Go 构建模块。

---

## 2. 目录

### 源码

```text
app/start/src/backend/   Bun + TypeScript API / 网关
app/start/src/routes/    文件式路由（博客页面 + /api/v1/**），routeTree.gen.ts 自动注册
app/start/src/server/    Start 中间件层（http / document / public-pages / cache-policy / theme …）
app/start/src/web/       主题、样式、插件、共享 React 组件
app/start/src/components/ Start 侧页面级组件
app/start/test/          server 测试（test:server 的唯一目标）
app/start/assets/schema.sql  由 scripts/dump-schema.sh 从库里 pg_dump 生成，勿手改
app/admin/               Admin 源码（TanStack Start SPA 模式）
app/shared/              前后端共用，@shared/* 别名指向这里
locales/                 站长可覆盖的翻译包
deploy/                  systemd 模板 + 部署说明
scripts/                 运维脚本
```

### 运行时数据（部署、升级、清理一律不得覆盖）

```text
.env                     配置
uploads/                 媒体上传（可由 UPLOAD_DIR 覆盖；首次上传才创建）
backups/                 备份（可由 BACKUP_DIR 覆盖）—— 注意是复数
content/themes/*         上传的主题
content/plugins/*         上传的插件
app/start/dist/          前台 SSR 产物，运行时直接读它
app/admin/dist/          Admin 产物
node_modules/
```

> `backups/` 这个名字容易写错。程序里是 `process.env.BACKUP_DIR || 'backups'`
> （`routes/backup.ts:10`）。写 rsync 排除清单时抄成单数，`--delete` 会删掉真实备份。

`community/`、`id/`、`wordpress-plugin/` 三个独立项目在仓库外的 `../utterlog-others/`。

---

## 3. 本地命令

```bash
bun run check        # 类型检查（注意：只覆盖 app/start，不含 admin）
bun run build        # build:admin + build:web + start:build
bun run test:server  # app/start/test/
bun run audit:api    # 前后端接口覆盖核对
bun run verify       # check + build + test
bun run build:web    # = 主题样式同步，改 styles.css / theme.json 后必跑
                     # （根目录没有 sync:themes，那个在 app/start 下）
```

跑起来（**两步，不能跳过第一步**）：

```bash
bun run build      # 至少要 start:build
bun run dev
```

`backend/index.ts` 启动时动态 import `app/start/dist/server/server.js`。干净
checkout 直接跑 dev，那个文件不存在，Bun.serve 会对所有请求返回 503
「TanStack Start service unavailable」——**进程活着、日志正常、全站白屏**。
另外没有 watch：改后端要手动重启，改前端要重新 `start:build`。

端口：代码默认 9260（`config.ts`），**实际以 `.env` 的 `PORT` 为准**。
本地起不来先对照 `.env.example` 检查 `.env`，并确认本机 PostgreSQL 可连
（`DB_HOST` 不能是容器名）。

`bun run check` 不覆盖 admin —— admin 的类型检查藏在 `build:admin` 的 `tsc -b` 里。
改了后台代码要单独跑 `cd app/admin && bun x tsc --noEmit`。

**测试从仓库根跑**。在 `app/start/` 下跑会有约 10 个用例因相对路径失败。

---

## 4. 开发规则

- 改动留在仓库根内。
- 新后端代码用 Bun + TypeScript。
- 保持 PostgreSQL 专有行为，不要为兼容 SQLite 改写。
- Admin 与 Web 的 API 路径保持稳定，不要重新引入 Go handler 或 `api/`。
- 改运行时拓扑时同步更新部署文档和脚本。
- 清理代码时不要删运行时数据和被忽略的参考项目。
- 不要回滚用户已有改动；只处理当前任务相关文件。

---

## 5. 站点 / 仓库 / 服务对应表

| 域名 | 用途 | 仓库 | 服务 |
|---|---|---|---|
| **用户自己的博客** | 个人站 | `utterlog/utterlog`（本仓库） | Bun + systemd + PostgreSQL |
| **utterlog.io** | 程序发布站 + install.sh 分发 | `utterlog/utterlog-landing`（私有） | 静态 |
| **utterlog.com** | 去中心化网络中心站（Network Hub） | `../utterlog-others/community/` | utterlog-hub :8091 + utterlog-web :3001 |
| **id.utterlog.com** | Utterlog ID 账号中心（OAuth） | `../utterlog-others/id/` | utterlog-id :8090 |
| **docs.utterlog.io** | 文档 | `utterlog/utterlog-docs`（私有） | 静态 |
| ~~demo.utterlog.io~~ | 在线演示 — **尚未上线**（无 DNS 记录） | 本仓库部署的一个实例 | 同博客 |

> 不要混淆：用户的博客 ≠ utterlog.com。utterlog.com 是 Network Hub。

---

## 6. 数据库

- PostgreSQL 18 / 19 + pgvector。安装器默认装 19（**19 仍是 beta，只在 PGDG 的
  `-pgdg-testing` 里**），`PG_MAJOR=18` 退回 GA 版。当前 `schema.sql` 是从 18.3 导出的。
- 库名默认 `utterlog`，**实际由服务器 `.env` 的 `DB_NAME` 决定**。线上 psql 前先看
  `.env`，别照文档敲 `-d utterlog` 连错库。
- 表前缀 `ul_`（env `DB_PREFIX`），id-center 用 `uid_`。
  实现是**全文正则替换**：bootstrap 时把 schema.sql 里的 `/\bul_/g` 换成 `config.dbPrefix`
  （`db/client.ts:156`）。手写进 schema.sql 的标识符或字符串若恰好含 `ul_` 会被误伤。

### schema 改动必须动两个地方

`schema.sql` 只是**全新安装**的真源 —— `bootstrapSchemaIfFresh` 一发现 `ul_users`
存在就直接 return（`db/client.ts:153`）。**已存在的库只走 `runCoreMigrations()`**。

所以改 schema 的正确顺序是：

1. 先在 `db/client.ts` 的 `runCoreMigrations()` 里加 `create table if not exists`
   / `add column if not exists`；
2. 再 `make schema`（= `scripts/dump-schema.sh`）重新导出并 commit。

只做第 2 步，改动对所有已安装实例**零效果**。`client.ts:207` 那段注释就是这个坑的
现场记录：`access_logs` 有几列老库一直没补上，导致 `/track` 整条事务失败、统计停摆。

### 字段约定

- 文章状态：`publish` / `draft` / `private`（**不是** `published`）。DB 没有 CHECK
  约束，后端直接透传，四个值只是约定。`pending` 对文章是死值，真正在用的是评论状态。
- **两个时间字段类型不同**：`created_at` 是 **integer**（Unix 秒），`published_at` 是
  **timestamp**。这是全库到处写 `to_timestamp(created_at)` 的原因。公开列表 / 归档 /
  搜索排序一律用 `coalesce(published_at, to_timestamp(created_at))`。
- **embedding 不会自动生成**。全库唯一写它的是 `rebuildEmbeddings()`（`routes/ai.ts`），
  只能由管理员触发 `POST /api/v1/search/rebuild`。新文章在重建前 embedding 为 null，
  被搜索的 `embedding is not null` 过滤掉，**语义搜索静默降级成关键词搜索**。

---

## 7. 主题系统

5 套内置主题：

| 主题 | 状态 | 说明 |
|---|---|---|
| **Renascent** | 当前重点 | 学术极简，文字驱动首页 + 文章页深度重构 |
| **Azure** | 历史主主题 | 蓝 `#0052D9` |
| **Flux** | 实验 | 绿 `#00C767`，Stripe Link 风格 |
| **Nebula** | 暗色科技 | 天蓝 `#7FCFFF` 强调 + 纯黑底 + 玻璃质感卡片 |
| **Utterlog** | 旗舰参考 | 默认基线 |

**Chred 已废弃**，`blog-theme.ts` 把老站点的 `chred` 映射回 Azure + 红色强调。

### 改主题前必须先分清：副本还是转发

`themes/<T>/` 下混着两种模式，**光看目录长得一模一样**：

| 组件 | 模式 | 改哪里 |
|---|---|---|
| `CommentList` | **4 份各自独立实现**（`components/blog/` + Azure + Flux + Utterlog，每份 700+ 行） | **必须逐份改**，漏一份那个主题就没生效 |
| `CommentForm`、`PostContent` | Azure / Flux / Utterlog 下都只有一行 `export { default } from '@/components/blog/...'` | 改 `components/blog/` 那一份，**全站生效** |
| Nebula / Renascent | 无本地副本，直接 import `@/components/blog/*` | 同上 |

改之前先 `cat` 一下目标文件——一行 re-export 还是几百行实现，一眼就能分辨。
**「改 Azure 时只改 Azure 文件」这句话对转发型组件恰好是反的**：你以为只动了 Azure，
实际动的是全站。

### 样式同步（改主题样式的必经步骤）

`themes/<T>/{styles.css,theme.json}` 是唯一编辑入口，必须同步成 `public/themes/<T>/`
下的**真实文件副本**（不能用 symlink，部署后会 404）。前台靠
`<link href="/themes/<T>/styles.css">` 运行时加载。

`predev` / `prebuild` 会自动跑 `sync-theme-styles.mjs`；手动是根目录 `bun run build:web`（`sync:themes` 只在 `app/start` 下）。
只同步 `styles.css` 和 `theme.json` 两个文件。

不同步的两个可观察症状：**前台样式不变**；`theme.json` 的 `adminPanels` 决定后台显示
哪些设置 tab，不同步的话后台读旧 manifest，新加的 tab 根本不出现。

> 想让样式对所有主题生效（比如评论区的通用样式），写进 `web/styles/globals.css`
> ——那份是打包进去的，各主题的 styles.css 是按需加载的。

### 注册与切换

- **枚举真源**：`app/shared/blog-theme.ts` 的 `BLOG_THEME_NAMES`。
- **组件映射**：`web/lib/theme.ts`。注意 `ThemeComponents` 声明了 12 个槽位，
  实际被消费的只有 `Layout` / `HomePage` / `PostPage` / `ArchivePage`。
  **`CommentSection` 是死映射** —— 五个主题的 PostPage 都自己
  `import { CommentSection } from './PostInteractive'`。照 theme.ts 判断
  「Azure 用的是共享评论列表」会判断错、改错文件。
- `backend/blog-themes.ts` 只是从 `@shared/blog-theme` 原样 re-export，加主题不用碰。
- **切换**：POST `/themes/<id>/activate` 只写 `options.active_theme`（Azure 另写
  `azure_accent`），**需要刷新前台**才生效，这条路径不调 `/api/revalidate`。
- 上传 zip 解压到 `content/themes/<name>/`，但 `extensions.ts` 有
  `SUPPORTED_BLOG_THEMES` 白名单，非内置 id 一律 400 —— **第三方主题装得上、
  列得出，但永远激活不了**，目前实质只支持内置五套。
- `:root` 默认 CSS 变量固定为 Azure 蓝，`[data-color="steel"]` 兜底映射到 Azure。
  `data-theme` 承载主题名，`data-color` 承载配色，两者不要混。

**写注释注意**：只能提「当前主题」或泛指，不要写「和某主题保持一致」。

---

## 8. Admin 设计规范

> 本节是 **admin（`app/admin`）的强制规范**。前台 `app/start` 有 900+ 处内联样式，
> 属历史债，只在当前改动范围内收敛，不做无关重构。

### Token

`app/admin/src/styles/globals.css` `:root`：

```css
--ctrl-h-sm: 32px;
--ctrl-h-md: 40px;   /* 默认 input / 工具栏按钮 */
--ctrl-h-lg: 48px;   /* 主 CTA */
--ctrl-pad-sm: 0 12px;
--ctrl-pad-md: 0 18px;
--ctrl-pad-lg: 0 24px;
--ctrl-radius: 0;
--card-radius: 0;
--card-radius-hero: 0;
```

按钮：`.btn`(=MD) / `.btn-sm` / `.btn-lg` / `.btn-square` + 颜色变体
`.btn-primary | -secondary | -danger | -ghost`（颜色正交）。
Legacy alias 保留：`.btn-toolbar`、`.btn-toolbar-square`、`.btn-dialog`、`.btn-icon`。
Login 页 `.login-form .btn` 自动升级到 LG。

### 圆角：后台一律直角（硬性要求）

卡片、按钮、输入框、下拉、对话框、徽章、标签页、表格、提示条、上传框——全部
`border-radius: 0`。这是定下的视觉语言，**不要按通用设计惯例改回圆角**，也不要
因为某个组件库默认带圆角就跟着走。

例外只有本身就该是正圆的：头像、开关滑块、状态圆点、侧边栏折叠按钮、加载转圈，
用 `rounded-full`。

实现靠三组归零的 token（`--radius` / `--radius-sm|md|lg|xl` / `--ctrl-radius` 等九个变量）
加两条排除 `rounded-full` 的兜底 CSS。**不要逐个文件去删 `rounded-*` 类** ——
TSX 里还有 100 多处非 full 的 `rounded-*`，全靠兜底 CSS 压平，手删既漏又会复发。

### 颜色

- 变量：`--color-primary` / `--color-secondary` / `--color-neutral-*` /
  `--color-success` / `--color-warning` / `--color-error`
- 背景只用白 `#ffffff` 或浅灰 `#f8f9fa` / `#f3f4f6`
- 禁止渐变（尤其蓝紫）、霓虹色、彩虹色盘
- 单视图最多 3 个品牌色
- 文本：主 `#111827`、次 `#6b7280`、三级 `#9ca3af`
- 边框用 `var(--color-border)`（`#E1E6EB`），不要写死 `#d1d5db`

> admin 里还躺着一整套 `.dark` / `[data-color="dark"]` 配色和 45 处 `dark:` 工具类，
> 但没有任何代码会设置这两个选择器 —— 是遗留死代码。**admin 锁定浅色单主题，
> 新代码不要写 `dark:` 变体。**

### 字号

- 标准档：`12 / 14 / 16 / 20 / 24 / 32px`
- **另有 6 个 dense 档**（9 / 10 / 11 / 13 / 15 / 22px），全站用了 300+ 处，
  是密集表格和徽章的既定尺度，**不要去「收敛」它们**
- Body `400 / 1.5`，Heading `600 / 1.25`
- 标准档写 px、dense 档写 rem 是现状，新代码跟随所在档位

### 间距

- 4px 栅格：`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px`
- 不要 magic number（13px、7px、23px 这类）
- 同一组件家族内 padding 保持一致

### 组件

- 卡片：描边为主。`.card` 目前带一道极轻阴影 `0 1px 3px rgba(0,0,0,0.06)`，是登记
  在案的例外，别再往上叠
- 其余阴影两档：`0 1px 3px rgba(0,0,0,0.08)` / `0 4px 12px rgba(0,0,0,0.1)`，
  单页最多用 2 档
- 按钮 solid fill，无渐变，hover 变暗 10%
- 输入框 1px 描边、直角；focus 有 3px 光晕（现状，别按「禁止 glow」去删）
- 表格：单元格 `px-3 py-3`、表头 `h-11 px-3`。**改 `components/ui/shadcn/table.tsx`
  的默认值，不要在单个页面上覆盖** —— 十二个列表页共用它，单页调整会让各页行高长歪

### 图标

- **admin 用 lucide**（77 个文件），**前台用 Font Awesome**（`fa-*` 1000+ 处）。
  两侧不互串，同一视图内不混用
- 尺寸：inline 16px，独立 20px
- **禁止 emoji 当功能图标**（邮件模板同样适用）

### 移动端

**输入控件字号在窄屏必须 ≥ 16px。** iOS Safari 只要 input / textarea 字号小于 16px，
聚焦时就强制放大整个页面，放大后版心被推出视口。这不是审美问题而是功能故障，
且**桌面端测试完全看不出来**。

内联样式写不了媒体查询，优先级还压过类选择器——凡是需要媒体查询、伪元素、
`:hover` 的，必须把样式挪进 CSS 文件，留在 `style={{}}` 里新规则会完全失效。

---

## 9. 发布流程

```bash
# 1. 改完代码 + 同步 CHANGELOG.md ## 未发布 → ## [X.Y.Z] - YYYY-MM-DD
git add -A && git commit -m "chore: release X.Y.Z"
git push origin main

# 2. 等 CI 绿了再打 tag（见下方「坑」）
git tag vX.Y.Z && git push origin vX.Y.Z

# 3. 创建 GitHub Release
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <从 CHANGELOG 提取的段落>
#    标题：仅 vX.Y.Z（无「正式发布」等后缀）
#    正文：### 新增 / ### 优化 / ### 修复 / ### 移除（中文）
#    不要放升级命令块

# 4. 进 ../utterlog-landing/ 改 package.json version → push → 自动 deploy
```

**GitHub Release 不只喂官网**：后台的「检查更新 / 一键升级 / 更新历史」拉的是同一个
releases API。Release **必须非 draft** 才会被后台识别。

### 版本号要同步改 3 处

- 根 `package.json`
- `app/admin/package.json`
- `bun.lock` 里 `app/admin` 那一段的 `version` —— **手改**。实测 bun 1.3.14 的
  `bun install` / `--lockfile-only` / `--frozen-lockfile` 都不会重写它，
  `--frozen-lockfile` 也不会因版本不一致而失败，**改漏了没人拦**。根 workspace 在
  `bun.lock` 里没有 version 字段，要改的就这一处。

**不要动** `app/start/package.json`（独立版本号）。

`metrics.ts` 的 `cachedAppVersion` 是第三级兜底（先读 `APP_VERSION` / `BUILD_VERSION`
env，再读 `cwd/package.json`，最后才是它），而 systemd 的 `WorkingDirectory` 就是仓库根，
package.json 必然读得到 —— **正常部署不会触发，不用随版本改**。

后台版本徽章是编译期常量（`app/admin/vite.config.ts` 注入 `__UTTERLOG_VERSION__`），
不重新构建 admin 就不会变。

### 版本策略

- Bun 重写后从 `1.x` 重新编号，当前版本以根 `package.json` 为准
- `1.x.y` patch：修复 / 小优化；`1.x.0` minor：完整新功能
- 旧 `2.0.x`–`2.5.x` 线属重写前的 Go + Next.js 架构，已归档进 `RELEASE_HISTORY.md`。
  **tag 还留在仓库里，最高 v2.5.2** —— 按语义化排序它高于当前的 1.x，
  任何取「最新版本」的地方必须按发布时间排序，不能按版本号

### CHANGELOG 规则

- 每次改动完成立刻更新 `## 未发布`，不要等发布前补
- 固定四段：`### 新增` / `### 优化` / `### 修复` / `### 移除`，没内容写「暂无。」
- 只写用户能理解的功能变化，不写 commit 细节、不写构建产物、不写升级命令

### 坑：tag 打早了，release 附件就空了

`release-build.yml` 用的是 **tag 那一刻**的 workflow 定义。tag 之后再修 CI 配置，
`gh run rerun` 也救不回来。**打 tag 前先 `gh run list` 确认 CI 是绿的。**

### Bun 版本

**CI 和生产实跑的基线是 1.3.14。** `package.json` 的 `packageManager: bun@1.4.0`
指向一个**尚未发布**的版本（npm 上 latest 是 1.3.14），不要照抄进 workflow 或版本门槛
——setup-bun 会 404。`scripts/deploy.sh` 里那个 `version_at_least ... 1.4.0` 判断
恒为假，导致每次部署都白重装一次 Bun。

构建注意：TanStack Start 路由的服务端 loader 在构建期**不能**无条件访问外部 API，
必须 gate `INTERNAL_API_URL`，否则 prerender 会重复等待。

---

## 10. 用户安装路径

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | sudo bash
```

`DOMAIN=` / `DB_HOST=` 等变体见 [INSTALL.md](INSTALL.md)。

`install.sh` 自动：clone/快进更新 → 装 Bun 与主机依赖 → 生成随机 `DB_PASSWORD`、
`JWT_SECRET` → 找空闲端口（默认 9260，被占顺延）→ 准备 PostgreSQL → 校验和构建 →
安装 systemd 服务 → 健康检查。

升级优先 `sudo bash /opt/utterlog/scripts/update-bun.sh`；后台一键升级通过 systemd
path unit 调用同一脚本。

---

## 11. 生产部署

### 维护者自己的站点怎么部署

本地构建 + rsync + 服务器 `bun install` + systemctl restart，**不走 Docker**：

```bash
make deploy-utterlog       # 或直接 bash scripts/deploy-utterlog-bun.sh
```

流程细节见 `deploy/utterlog/README.md`（那份是唯一来源）。

### ⚠️ 部署前必须确认打在哪台机器上

目标机完全由开发机 shell 里的 `UTTERLOG_DEPLOY_HOST` 决定（脚本里必填、无默认），
仓库内不存任何生产 IP。**这意味着没有任何东西会拦住你部署到错的机器。**

2026-08-04 就因此连续多次把代码部署到一台已停用的旧服务器上——两台机器的
hostname、目录、服务名完全相同，从服务器内部看不出区别，而线上一直是旧产物。

部署前逐条确认：

1. `echo $UTTERLOG_DEPLOY_HOST`，和目标核对；
2. 目标机身份以仓库外的 gitignored 文件为准（如 `~/.utterlog-deploy.env`），
   **不要从记忆或历史会话里取 IP —— 那些一律不可信**；
3. ssh 上去跑 `systemctl is-active utterlog-app`，确认它就是当前对外服务的那个实例；
4. 部署后**回源验证**（见下）。

### ⚠️ 验证线上必须回源

维护者的生产链路前面有一层 CDN。直接 `curl https://<域名>` 可能拿到缓存，
**部署成没成完全看不出来**。正确姿势：

```bash
ssh <host> "curl -s -H 'Accept-Encoding: identity' http://127.0.0.1:<PORT>/ | grep -o 'index-[A-Za-z0-9_-]*\.css'"
```

再和本地构建产物的 hash 对比。两边一致才算真的上线。

### 不变量

- 默认安装目录 `/opt/utterlog`，服务名 `utterlog-app`，监听 `127.0.0.1:9260`
  （实际端口以 `.env` 为准）。
- 公开流量由站长已有的 Nginx / Caddy / 面板反代接入。
- PostgreSQL + pgvector 可同机或外部；不依赖 Redis。
- `.env`、`uploads/`、`content/`、`backups/` 是运行时数据，部署和升级不得覆盖。
- 真实域名、IP、SSH 私钥、数据库密码、API Key、OAuth Secret 一律不得提交到仓库；
  部署示例用占位符。

---

## 12. AI 协作约定（硬规则）

1. **不加 `Co-Authored-By: Claude`** 到任何 git commit。
2. **AI 输出禁 emoji**。所有 AI prompt 加「禁止 emoji」指令；前端 `stripEmoji` 过滤。
3. **代码注释禁提其他主题名**（不要写「和 OneBlog 一致」）。注释只描述功能。
4. **Bun 优先**：开发 `bun run dev`，生产 systemd，不新增第二套运行方式。
5. **图标遵守 §8**：admin lucide、前台 Font Awesome，同一视图不混用。
6. **地图用 Mapbox GL JS**，不要尝试 PixiJS 像素地图（之前调坏过）。
7. **不发 preview screenshot**。编译通过 + console 无报错就告知用户测试。
8. **Release notes** 不含升级命令块。
9. **报告「已修复 / 已生效」前必须实测**，不能只凭代码改动推断。跨 CDN 的要回源验证，
   删依赖前要确认不是被同名字符串误判（曾把 `tailwindcss-motion` 当成 `motion` 有引用）。
10. **会话接近 90% 上下文时主动写 memory**，并给出下次会话提示词。
11. **不重新设计 / 不重构**：仅修复用户当前任务相关文件，不扩大改动范围。

---

## 13. 常用文件速查

> 数量和清单会变，以 `ls` 为准；这里只列入口。

### 后端

| 模块 | 文件 |
|---|---|
| Server 入口 / CORS | `backend/index.ts` |
| 配置 / 启动校验 | `backend/config.ts` |
| DB 客户端 / helpers / options | `backend/db/{client,helpers,options}.ts` |
| Auth | `backend/auth/{jwt,session,password-reset}.ts` |
| 邮件 | `backend/email.ts` + `backend/email/{templates,comment-moderation,comment-reply-unsubscribe}.ts` |
| 业务服务（约 30 个） | `backend/services/*.ts`（`auth` `posts` `comments` `public-comments` `friend-links` `link-icons` `tracking` `install` …） |
| Feed / robots / sitemap | `backend/routes/content.ts` |
| AI | `backend/routes/ai.ts` |
| 备份 / 维护 | `backend/routes/backup.ts` |
| Telegram | `backend/routes/telegram.ts` + `backend/telegram.ts` |
| WordPress 兼容 / 站点同步 | `backend/routes/compat.ts` |
| 插件 / 扩展 | `backend/routes/extensions.ts` |
| GeoIP / Bot 检测 | `backend/{geoip,bot-detect}.ts` |
| Analytics rollup | `backend/analytics/rollup.ts` |
| 媒体 | `backend/media/{storage,favicon,ico-decode,branding}.ts` |
| HTTP 工具 | `backend/http/{install-redirect,public-url}.ts` |
| Cache | `backend/cache/revalidate.ts` |
| 系统 | `backend/system/{host,metrics}.ts` |
| Sync worker | `backend/sync/worker.ts` |

### 前端 / 共享

| 功能 | 路径 |
|---|---|
| 文件式路由 | `app/start/src/routes/` |
| SSR 请求入口 | `backend/web/start.ts` |
| Start 中间件链 | `app/start/src/start.ts` + `app/start/src/server/*.ts` |
| Web 主题源码 | `web/themes/{Utterlog,Azure,Flux,Nebula,Renascent}/` |
| Web 全局样式（跨主题共用） | `web/styles/globals.css` |
| Web 组件 | `web/components/{blog,layout,pages}/` |
| Web Lib | `web/lib/{api,store,theme,theme-context,…}` |
| 主题样式同步 | `web/scripts/sync-theme-styles.mjs` |
| 跨包共享 | `app/shared/{blog-theme,site-favicon,string-utils,permalink,link-match}.ts` |
| Admin 入口 / 路由 | `app/admin/src/router.tsx` + `app/admin/src/routes/` |
| Admin API 客户端 | `app/admin/src/lib/api.ts` |
| Admin 设计 token | `app/admin/src/styles/globals.css` |
| Admin 通用 UI | `app/admin/src/components/ui/*` |
| Schema | `app/start/assets/schema.sql` |
| 生产服务模板 | `deploy/systemd/*.service` + `*.path` |
| 部署 / 升级脚本 | `install.sh` + `scripts/{deploy,deploy-utterlog-bun,update-bun}.sh` |

---

## 14. 已知坑 / 历史教训

1. **文章状态** `publish` 不是 `published`。写错会查到 0 篇。
2. **发布时间** 优先 `published_at`；草稿首发写当前时间，不能套草稿创建时间。
   `datetime-local` 输入按站点时区解析。注意两个时间字段类型不同（见 §6）。
3. **Slug 唯一约束** 草稿和正式文章共表，草稿首发可能撞 slug。
4. **缓存失效** 保存站点设置后要调 revalidate；但**主题切换不走这条路**（见 §7）。
5. **构建期 chunk 失效**：保留错误边界和有限重试，避免无限刷新。
6. **Admin 缓存策略**：`index.html` `no-cache`，`assets/*.js` `immutable`。
7. **AI 陪读头像** 优先 admin 个人 `avatar`（非 gravatar_url）。
8. **所有邮件**站点品牌化，footer 保留 "Powered by Utterlog"。按钮规格统一在
   `email/templates.ts` 的 `emailButton`，每个按钮都要带等宽边框——描边按钮不带的话
   会比旁边的实心按钮高 2px（邮件里没有 box-sizing 可依赖）。
9. **systemd 后台升级** 只写请求标记；实际拉取、验证、重启由 root oneshot 单元执行。
10. **id-center 新 passkey** 需 `residentKey: required` 才支持 discoverable login。
11. **Network Hub SSR** 用 `INTERNAL_API_URL`，浏览器侧用 `/api/v1` 相对路径。
12. **位置反查失败** 不要把经纬度写进位置字段，提示用户手填。
13. **AI 错误透传**：保存 / 状态切换失败时把后端原因带回前台。
14. **友链图标抓取**（`services/link-icons.ts` + `media/ico-decode.ts` +
    `shared/link-match.ts`）连踩三次：① sharp 不支持 ICO，`/favicon.ico` 这条回退
    路径必须自己解容器；② HTML 属性**可以不加引号**，正则强制要求引号会漏掉一批站点；
    ③ 抓取用户填的 URL 必须逐跳做 SSRF 校验，`redirect: 'follow'` 会让公网地址 302
    到内网绕过入口检查。
15. **依赖是不是真的没人用**：宽松的字符串匹配会误判。`motion` 在源码里零引用，
    却因为 CSS 里有 `tailwindcss-motion` 和 `prefers-reduced-motion` 被判成「有引用」。
    删依赖前按 import 语句核对。
