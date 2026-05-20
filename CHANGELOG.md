# 更新日志

本文件记录 Utterlog 的版本变更。版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

发布说明统一使用中文分类，每个版本固定保留四个段落：`新增`、`优化`、`修复`、`移除`。
Docker 镜像地址不写入更新日志；镜像发布由 GitHub Actions 的 Docker workflow 自动处理。

## 未发布

### 新增

暂无。

### 优化

暂无。

### 修复

暂无。

### 移除

暂无。

## [2.5.2] - 2026-05-18

### 新增

暂无。

### 优化

- **Typecho 插件独立仓库化**：`typecho-plugin/UtterlogSync` 已拆分到 [`utterlog/UtterlogSync`](https://github.com/utterlog/UtterlogSync)，主仓库只保留 Utterlog 服务端 / 前端代码。
- **镜像同步覆盖升级 sidecar**：`scripts/sync-mirrors.sh` 新增 `docker:27-cli` 同步项，与 `pgvector` / `redis` / `caddy` 一起每日凌晨 3 点从 Docker Hub 镜像到 `registry.utterlog.io`。

### 修复

- **国内服务器一键升级在 sidecar 启动阶段卡死**：后台升级用的 `docker:27-cli` sidecar 之前直连 Docker Hub，国内 ISP 普遍不可达，导致 `升级请求 已收到` 之后停在 `Unable to find image 'docker:27-cli' locally` 并以 `exit status 125` 失败。改为从 `registry.utterlog.io/utterlog/docker:27-cli` 拉取，镜像由 `scripts/sync-mirrors.sh` 每日自动同步、内容字节一致。

### 移除

- 移除主仓库内的 `typecho-plugin/UtterlogSync` 插件源码，避免插件与主项目重复维护。

## [2.5.1] - 2026-05-17

### 新增

- **官网 pull-only 安装文件纳入仓库**：新增 `deploy/site/`，保存发布到 `utterlog.io` 的 `install.sh` / `docker-compose.yml` / `.env.example` / README，明确它与根目录源码安装脚本分工，避免后续发布把线上国内优化脚本覆盖回旧版本。
- **镜像同步维护脚本**：新增 `scripts/sync-mirrors.sh`，用于在 registry 主机把 `pgvector/pgvector:pg18`、`redis:8-alpine`、`caddy:2-alpine` 同步到 `registry.utterlog.io`，降低国内用户安装时卡在 Docker Hub 的概率。

### 优化

- **`utterlog.io/install.sh` 默认国内友好**：Docker 缺失时默认走 Docker 官方脚本的 Aliyun mirror；fresh host 自动写 Docker Hub `registry-mirrors` 到 `https://registry.cn-hangzhou.aliyuncs.com`；`docker compose pull` 拆成基础镜像与应用镜像两段并加超时；`POSTGRES_IMAGE` / `REDIS_IMAGE` 可覆盖，应用镜像从 `registry.utterlog.io` 拉取失败时 fallback 到 GHCR。
- **Docker 发布 / 安装 / 升级链路系统化兜底**：GHCR 明确作为权威应用镜像源，`registry.utterlog.io` 作为可探测镜像源；官网安装脚本与后台一键升级会先用 20 秒 manifest 探测选择可读源，并把选中的 `UTTERLOG_IMAGE_PREFIX` 写回 `.env`，避免 `pull` 和 `up` 使用不同镜像源。
- **Docker workflow 改为 GHCR 阻塞发布源**：`docker-publish.yml` 推送并校验 GHCR 目标 tag manifest；`registry.utterlog.io` 降级为安装 / 升级时可探测镜像源，不再因为 registry 代理层卡顿拖死正式发布。
- **Docker 镜像标签兼容 Git tag**：发布 `v2.5.1` 时同时保留 `2.5.1` 与 `v2.5.1` 两种镜像标签，避免校验脚本或服务器固定版本部署因为 tag 形式不同失败。
- **README 快速开始改用官网安装入口**：默认推荐 `curl -fsSL https://utterlog.io/install.sh | bash`，把 GitHub raw 源码安装保留为源码 / 内置 Caddy HTTPS 场景。
- **前台请求拦截迁移到 Next 16 Proxy 约定**：`web/middleware.ts` 按官方迁移方式改为 `web/proxy.ts`，导出函数从 `middleware` 改为 `proxy`，消除 Next 16 构建时的弃用警告。
- **Nebula 页脚快捷入口对齐 Azure 布局**：Utterlog logo 与音乐入口移到页脚最左侧，Utterlog 使用整颗 logo 铺满显示；RSS 从页脚移到 header 右侧 actions，并复用 header 圆形透明按钮风格。

### 修复

- **后台升级成功后按钮仍卡在“升级中...”**：API 重建会清空后端内存里的升级状态，但日志已经写入 `升级应用 [Utterlog] 成功 [TASK-END]`。`SystemUpdatePanel` 现在识别日志终止标记并归一化状态，成功时立即停止轮询、释放按钮、强制刷新版本信息并触发 `admin:version-changed`，不再依赖手动刷新页面。
- **Nebula 文章页 TOC / 回到顶部定位偏差**：目录高亮从 `IntersectionObserver` 改为按实际滚动容器坐标计算，点击目录时区分 `.blog-main` 与 window 的偏移；页脚右侧“回到顶部”也会先确认 `.blog-main` 真正可滚动，避免点了没有回到顶部。
- **后台关注站点无法正确保存**：旧 `ul_followers` 约束按本地用户 `follower_id` 去重，但远程站点关注使用 `source_site` + `0` 占位，导致只能写入第一条或被外键拦截。启动迁移现在移除旧约束，改为按远程站点 URL 去重，并让关注接口返回真实保存错误。
- **前台 / 后台 npm 依赖安全审计漏洞**：后台 lockfile 升级 `axios` 到 1.16.1；前台 lockfile 升级 `next` 到 16.2.6、`axios` 到 1.16.1、`dompurify` 到 3.4.4、`@xmldom/xmldom` 到 0.8.13、`follow-redirects` 到 1.16.0，并通过 `overrides.postcss` 固定安全版 `postcss`，`npm audit --audit-level=moderate` 已清零。

### 移除

暂无。

## [2.5.0] - 2026-05-16

### 新增

- **`/sitemap.xml` 端点**：`api/internal/handler/seo.go` 新增 `SitemapXML` handler，含首页 + 14 个静态索引页（about / archives / films / moments / footprints / coding / links / albums / music / books / games / movies / goods / feeds）+ 全量 publish post 与 video（按 admin permalink_structure 渲染，video 永久指向 `/films/<slug>`）+ 全量 category / tag。`<lastmod>` 按 `site_timezone` 输出 RFC3339 带偏移。`robots.txt` 之前引用但未实现，现在终于兑现。
- **文章 OpenGraph + Article JSON-LD**：`/posts/<slug>` 注入 `BlogPosting` 微数据（headline / author / datePublished / dateModified / image / publisher / mainEntityOfPage）+ OpenGraph `article:published_time` / `article:modified_time` / `authors`。`/films/<slug>` 的 Movie & TVSeries JSON-LD 加 `dateModified`，`datePublished` 没填年份时回落到文章发布时间。Google / 微信 / 微博等社交分享卡片现在能拿到准确日期。
- **后台站点时区选择器升级**：从原本 15 项硬编码 IANA 下拉，升级为 input + datalist 90+ 城市，每行显示「城市 · UTC±N · IANA」（如「北京 / 上海 · UTC+8 · Asia/Shanghai」「巴黎 · UTC+1 · Europe/Paris」「洛杉矶 · UTC−8 · America/Los_Angeles」）。偏移用 `Intl.DateTimeFormat` 实时计算，自动跟随夏令时。支持自由键入任意合法 IANA 名，后端 `siteclock.IsValid` 兜底校验。
- **评论时间绝对值 tooltip**：评论列表的「X 分钟前」hover 显示完整绝对时间（按 `site_timezone` 格式化为 `YYYY-MM-DD HH:MM`），覆盖 5 份 CommentList 副本（shared + Azure / Chred / Flux / Utterlog）。
- **Web `<Button>` 组件用 .btn 类体系**：`web/components/ui/button.tsx` 从 inline CSSProperties 重写为 className composer。`web/app/globals.css` 已有的 `.btn / .btn-primary / .btn-secondary / .btn-danger / .btn-ghost` 体系扩展出 `.btn-sm` / `.btn-lg` / `.btn-spinner`，hover / `:focus-visible` 双层焦点环 / `:disabled` / `:active` 全在 CSS 层一次定义。
- **Nebula 主题 hero_tiles 后台配置**：「主题 → 首页图块」tab 现在能正确显示（之前因 `sync-theme-styles.mjs` 只同步 css 不同步 theme.json，运行时 manifest 缺 `hero_tiles` 声明）。脚本扩展为同步 `styles.css` + `theme.json`，6 主题的 adminPanels 字段更新后自动生效。

### 优化

- **全站时区一致性大改**：`site_timezone` 选项现在贯穿整条链路 ——
  - **后端**：`crud.go` RSS pubDate / `analytics.go` 日活分桶 / `analytics_rollup.go` 全套（含 oldestDay / yesterday / rollupCutoffDate / dateOnly / formatYMD 新增 `dayStartInSite` helper）/ `analytics_breakdown.go` periodWindow today + jan1 / `coding.go` rolling365Range + emptyCodingContributions + buildCodingContributions + fetchCodingGitHubData / `footprint.go` parseFootprintDate / `seo.go` LlmsFullTxt Generated 时间 — 全部由 `siteclock.Location()` 统一切日。之前 `_total` 维度走 site_tz、breakdown 维度走 UTC，跨午夜数据错配，现在两路对齐。
  - **前端**：`FootprintsClient` / `coding/page.tsx` todayContributionCount + rollingDays / `archives/Heatmap.tsx` + Nebula NebulaHeatmap（接收 timeZone prop，UTC 步长 + site_tz 切日，跟后端 heatmap 分桶口径对齐）/ `GitHubRepoCard` 推送时间 / `BlockAnnotation` 批注时间 / `MomentEmbed` 说说嵌入时间 全部走 `useThemeContext().timeZone` + `formatDateInTimeZone` / `datePartsInTimeZone`。
  - **评论问候**：5 份 CommentForm 副本的「早上好 / 晚上好」按 `site_timezone` 当前小时算（Intl.DateTimeFormat 取 hourCycle:'h23'），跨时区站长 / 访客都跟站点一致。
  - **Admin**：13 处 `toLocaleString*` 切到 `formatWithAdminTimeZone`（SyncSitesPanel / SystemUpdatePanel 3 处 / NotificationBell / AiLogs / Assistant 2 处 / Analytics / Footprints / Profile 2 处 / Security）；新增 `adminDateYMD` / `adminDateYMDHM` helper，PostEdit / PostCreate / PageEdit 的 `<input type="datetime-local">` 初值按 `site_timezone` 渲染，跟后端 `parsePostPublishedAt` 的 `siteclock.Location()` 解析往返一致；SystemStatusPanel 左下角时钟按 `site_timezone` 跳动，远程站长能看到「站点所在地」的当前时间。
- **影视模式标题层级收敛**：`VideoPostBody` 不再渲染 h1，h1 统一由 6 主题各自的 PostPage 渲染。Renascent 双 h1 / Utterlog meta 倒置 / Nebula 缺过渡 / Azure-Chred-Flux 缺 hero 替代物 都修好。`web/styles/video-post.css` 删掉无用的 `.ul-video__title` 规则。
- **AIReaderChat 颜色透主题**：写死的 Azure 蓝 `#0052D9` / `#e8f0fe` / `#fafafa` 等换成 `var(--color-primary)` / `var(--color-bg-soft)` / `var(--color-border)` / `var(--color-text-sub|dim)`。陪读卡片现在在 Chred 红 / Flux 绿 / Nebula 深紫 / Renascent 黑灰主题下都跟随主题色。
- **Schema.org Movie/TVSeries 微数据增强**：`/films/<slug>` JSON-LD 新增 `dateModified`，`datePublished` 没填 `meta.year` 时回落到 `postDateInput(post)`。

### 修复

- **RSS pubDate 错位**：之前一律取 `created_at` 而非 `published_at`，草稿先建后发的文章订阅源里日期错位（13 号入草、16 号发布会显示 13 号）。改为 `published_at` 优先、`created_at` 兜底，与列表排序 `COALESCE(published_at, created_at)` 口径一致。
- **`/coding` 今日 commit 计数偏移**：原本用 `new Date().toISOString().slice(0, 10)` 取「今日」键，浏览器本地与 UTC 跨午夜时格子错位。改为 `datePartsInTimeZone` 按 `site_timezone` 切日。
- **足迹 visited_at 解析错位**：`footprint.go:parseFootprintDate` 之前 `ParseInLocation(layout, value, time.Local)` 用容器时区（通常 UTC），+0800 用户填的「今天」被算成「站点时区今天 08:00」错位一整天。改为 `siteclock.Location()`。
- **Nebula「首页图块」后台 tab 失踪**：根因是 `sync-theme-styles.mjs` 只同步 css 不同步 theme.json，源码加 `"hero_tiles"` 到 `adminPanels` 后，运行时 `web/public/themes/Nebula/theme.json` 一直是老版本。脚本扩展为同步两类文件，6 主题的 manifest 也一并修齐。
- **分析 / 编码热力图跨午夜数据错配**：之前 logAccess 实时 UPSERT `ul_analytics_daily._total` 用 UTC 日期键，但 daily rollup 也用 UTC 日期键。+0800 站长晚上 8 点写文章会落到 UTC 次日，跟前端按站点自然日预期不符。所有 daily 分桶（含 ul_visitor_dates / ul_stats_post_daily）现在统一走 `siteclock.Location()`。

### 移除

- `web/components/blog/PostCard.tsx`：无任何调用方（6 主题都有自己的 PostCard 副本），死代码。
- 旧的 `<Button>` inline CSSProperties 实现：伪类写不出来 hover / focus / active 全失效，重写为 className composer 后由 `.btn` 类接管所有状态。
- 后台时区选择器的硬编码 15 项 `COMMON_TIME_ZONES` 数组与 `buildTimeZoneOptions()` 函数：被新 `TimezoneCombobox` 组件取代。

## [2.4.2] - 2026-05-16

### 新增

- **专业影视模式**：文章新增 `type='video'` 类型，承载多集 / 多线路可在线播放的影视内容（电影 / 剧集 / 综艺 / 动漫 / 纪录片）。复用 `ul_posts` 整套基础设施（评论 / SEO / RSS / 搜索），新增 `ul_post_episodes` 表（每集 `video_url` / `embed_url` / `platform` / `alt_sources` 多线路 / 时长 / 集封面）+ `ul_posts.meta` JSONB 列（影视元数据：导演 / 主演 / 类型 / 地区 / 年份 / 总集数 / 语言 / 豆瓣评分 / 豆瓣 URL / IMDb / 温馨提示）。
- **后台「娱乐 → 影视」管理**：左侧导航新增「影视」子项，独立 `/films` 列表页（status 过滤 / 搜索 / 海报缩略图 / 元信息 / 编辑 / 删除）+ 「新建影视」入口。`/films/create` 和 `/films/edit/:id` 复用 PostCreate / PostEdit 全屏布局，按 `type=video` 切换 UI：上方一整张「影视元数据」卡片 + 中间「剧集列表」（添加 / 上下移 / 删除 / 备线折叠 / 批量粘贴）+ 下方 Markdown 简介编辑器。
- **豆瓣 / NeoDB 链接一键导入**：元数据卡片右上角「链接导入」按钮调 `/media/parse`。后端 Douban 解析器升级为 JSON-LD + `#info` 块抓取，自动填充导演 / 主演 / 类型 / 上映年 / 时长 / 评分 / 制片国家 / 语言 / IMDb / 集数；NeoDB 走自家公开 API。封面 / 标题 / 简介按「字段为空才填」语义合并，不覆盖用户已手填的内容。
- **前台 `/films` 海报网格 + 筛选**：访客侧新增 `/films` 列表页，类型 tab（全部 / 剧集 / 电影 / 综艺 / 动漫 / 纪录片）+ 已筛选 chip（年份 / 地区可移除）+ 2:3 海报网格（集数徽章 + 豆瓣评分徽章 + 类型徽章）+ 上 / 下页分页。`/films/<slug>` 详情页复用主题 PostPage，自动按 type=video 切到 VideoPostBody 渲染：左海报 + 右元信息 + 16:9 自适应播放器 + 主线 / 备线 chip 切换 + 集数网格切集 + 温馨提示。播放器支持 YouTube / Bilibili / 腾讯 / 优酷 / 爱奇艺（iframe）和 mp4 / webm / m3u8（HLS 按需懒加载 hls.js，Safari 走原生）。
- **影视专属 SEO（schema.org/Movie & TVSeries）**：`/films/<slug>` 注入 JSON-LD 微数据（name / director / actor / genre / countryOfOrigin / datePublished / numberOfEpisodes / aggregateRating / image / inLanguage），Google 显示「电影卡片」rich snippet。OpenGraph 用 `video.other` type + 海报当 og:image。
- **影视 RSS 订阅**：`/api/v1/feed?type=video` 单独订阅影视、`?type=all` 混合两类、不带参数保持原行为（只发文章）兼容现有订阅者。

### 优化

- **`/posts/<slug>` 自动 308 redirect 到 `/films/<slug>`**：影视类型的 post 遇到走错门口的外链 / 旧书签时永久重定向，避免 `/posts/<slug>` 和 `/films/<slug>` 两套 URL 同时被搜索引擎收录（duplicate content）。
- **影视编辑页全宽布局**：`/films/create` 和 `/films/edit/:id` 加入 `fullWidth` 路由集合，与 `/posts/create` 享受同一套全屏（隐藏 main 滚动条 + 编辑区自接管内部滚动），不再被 1280px 居中容器卡住。
- **`getPosts` 前端 API helper 扩展**：新增 `type` / `video_type` / `region` / `year` / `genre` 参数，后端 `PostsListOptions` 用 JSONB `->>` 等值过滤 + `@>` 数组包含过滤；普通 `/posts` 调用不传新参数即可保持原行为。

### 修复

暂无。

### 移除

暂无。

## [2.4.1] - 2026-05-16

### 新增

- **Typecho 同步功能 + 完整 Typecho 插件**：后台「工具」新增「Typecho 同步」tab（与「WordPress 同步」并列），共享同一套同步基础设施。`ul_sync_sites` 加 `platform` 列区分两类站点；服务端 `/api/v1/sync/typecho/*` 是 `/api/v1/sync/wordpress/*` 的别名（同一组 handler），保证协议平台无关。同时新增 `typecho-plugin/UtterlogSync/`（Plugin.php / Action.php / lib/Exporter.php / lib/Client.php / lib/Logger.php / panel.php + README）—— 与 WordPress 版功能对齐：后台设置页、测试连接、网络诊断（4 路 cURL 探针）、AJAX 分批推送（categories → tags → posts → pages → comments）、实时进度条 + 日志、断点重试。
- **Nebula 主题首页 Hero 4 个图块自定义入口**：后台「主题管理 → 首页图块」配置 icon（FontAwesome / 图片 URL / 内联 SVG / 上传图片）+ 标题 + 链接，按数组顺序填充第 1-4 位。未配置时仍显示原内置默认图块（影音 / 代码 / 旅行 / 日常）保持 OOB 体验。图片走 `<span>` + background-image 渲染（不是 `<img>`），右键不会出现「查看图像」「另存为」；并跟随 tile 15px 圆角裁切。
- **全站统一图片放大灯箱（FLIP 缩放）**：新增 `Lightbox.tsx` 共享组件，文章内图 / 说说图片 / 多主题图块 全部走同一份代码。打开时图片从被点缩略图位置以 FLIP（First, Last, Invert, Play）技术连续放大到全屏；关闭时反向飞回原位。Esc / ←→ 键盘导航、滚动锁定、UI 工具栏（上一张 / 下一张 / 关闭 / 计数 1/N / 加载指示）全部内置。说说页之前的简陋 `position: fixed` 层已替换。
- **2 处 DB 迁移**：（1）legacy `coding_github_token` 自动合并到 `github_access_token` 后删除；（2）`ul_links.name` / `ul_rss_subscriptions.site_name` 等 4 张表的 HTML 实体（`Kevin&#039;s` 这类脏数据）启动期一次性 unescape；写入路径加 `textutil.NormalizeDisplayName` 兜底防新数据。

### 优化

- **默认主题切换为 Azure**：新装站点首屏渲染主题从 Utterlog 改回 Azure（6 处硬编码 fallback 同步更新：后端 fallback / 前端 `DEFAULT_THEME` / web/admin API client 等）。已激活其他主题的现有站点不受影响。
- **Coding 页面同步策略调整**：缓存 TTL 30 分钟 → 60 分钟，配合现有 30 天 stale-while-revalidate 模型，等同于「最多 1 小时数据延迟，平时永不阻塞用户」的 feed 订阅体感。GitHub API 调用频率减半。
- **GitHub Token 配置去重**：之前「设置 → 第三方服务 → GitHub」和「页面 → Coding」两处都有 Token 输入，互相覆盖让用户困惑。Coding 弹窗移除 Token 输入框，只保留 URL；Token 唯一入口移到设置页，弹窗内显示 Token 状态指示 + 跳转链接。
- **全站 FontAwesome 单源加载**：移除 `web/app/layout.tsx` 的 4 个 woff2 preload 标签 + `web/app/globals.css` / `api/admin/src/styles/globals.css` 的 12 个 `@font-face` 覆盖声明，统一只引官方 `https://static.utterlog.com/libs/fontawesome/7.2.0/css/all.min.css`。移动端弱网下不再被多源解析判定为重复源拖慢首屏。
- **Admin loading 视觉彻底统一为 `fa-spinner fa-spin`**：之前 6 种 loading 视觉混杂（Button 内 96×96 齿轮 SVG、5 处 `fa-circle-notch`、4 处手写 SVG 12 圆点环、vinyl-spin 死代码……）现在全部收敛到 FontAwesome 自带 spinner 动画。Button.loading / Spinner 组件 / 散写位置外观一致。
- **Admin 全站按钮收敛为方形 icon-only + tooltip**：主题管理 / 插件管理 / 友链管理 / 足迹管理 / 媒体管理 / 相册管理 / 文章管理 / 分类管理 / 标签管理 / 页面管理 / 同步授权页等 30+ 个工具栏按钮统一改成 `btn-square` + FontAwesome icon + `title` hover 提示。搜索按钮全站蓝色 magnifier 风格一致。
- **CSS 冗余清理**：删除 `body {}` 在 globals 里的 3 块重复声明（合并为 1）、各主题 21 处冗余 `box-sizing: border-box`（Tailwind preflight 已覆盖）、Renascent 主题 typography 重复字段、4 处过时 `-webkit-transition` + 3 处 `-webkit-overflow-scrolling: touch`（iOS 13+ 已无需）+ 2 处 transition 列表里的 `-webkit-filter`。
- **图片懒加载真正跟随滚动淡入**：之前 fade 只看 `data-loaded`，但 Chrome 原生 `loading="lazy"` 默认在视口外 ~3000px 就预拉图，导致用户滚到时图早就清晰摆好没有 fade 体感。现在引入 `data-img-visible` 维度（IntersectionObserver 标记），CSS 要求 `data-loaded=1 AND data-img-visible=1` 才解模糊。视口外图保持模糊，进视口才淡入。文章内图（`.blog-image`）走同一规则，删了与全站冲突的 `.loaded .blog-image img` 旧规则。
- **文章编辑工具栏点击不再滚回顶部**：所有 toolbar 按钮加 `onMouseDown={(e) => e.preventDefault()}` 防 textarea 失焦；helper 函数 `wrap` / `linePrefix` 等保存 `scrollTop` 并用 `focus({preventScroll: true})` 二层防御。包括文章编辑 + 页面编辑。
- **下载卡片视觉收尾**：`[download]` shortcode 渲染按钮改造 —— `<a>` 不再被全局 ExternalLink 套上 favicon / 外链 icon / hover preview（在 `components.a` 拦截 `md-download-btn` className 透传原生 `<a>`），主题 prose 链接的下划线 + 链接色用 `!important` 强制覆盖。卡片 `border-radius` 8px → 4px 与全站直角风格收口。
- **Nebula 主题文章正文粗体可见性**：`strong` / `b` 颜色从 `--nebula-white`（与正文同色 off-white）改为纯白 `#FFFFFF`，配合 700 weight 在 PingFang SC 等中文字体下视觉对比明显。

### 修复

- **文章编辑「自定义封面 URL」清空保存后端不更新**：后端 `UpdatePost` 的 `CoverURL` 字段改为 `*string` 指针，区分「没传字段」（nil 不动）和「传了空串」（清空到 NULL）；前端去掉 `coverUrl || undefined` 永远发送字符串。现在删 URL 保存能正确清空。
- **「主题切换」toast 文字误导**：之前失败提示「访客下次访问后生效」，实际是 Next.js options ISR 60s 缓存到期才刷新。文案改为「约 1 分钟后自动刷新」贴合实际。
- **Azure 文章页「友链更新」tab 可点 + 显示**：Azure 文章页 PostNavigation 友链 tab 因永久 disabled + tab 区可见性判断都用 `tab.items.length`（feeds 数据实际在 `data.feeds` 另一字段）一直点不动；本次把判断特殊化 feeds 数据源，并补上 `randomCoverUrl + LazyImage` 让友链卡片展示风景封面。
- **主题 CSS 改完前台不生效**：`web/themes/<T>/styles.css` 与 `web/public/themes/<T>/styles.css` 是「源 + 服务」双份机制；记忆里加了改源后必须跑 `docker compose exec -T web npm run sync:themes` 的规则。
- **Admin 文案改了不生效**：`t('key', 'fallback')` 的 fallback 仅在 i18n JSON 没此 key 时才用；记忆里加了「改 admin 文案要同时改 `api/internal/i18n/locales/*.json` 3 个语言文件并重启 api 让 embed.FS 重新加载」的规则。
- **HTML 实体显示问题**：友链 `Kevin&#039;s` 这种串前台原样显示。一次性迁移把 4 张表的脏数据 unescape，写入路径加 `NormalizeDisplayName` 兜底。
- **所有 toast emoji 装饰移除**：`✨ ℹ️ ⚠️` 不再出现在系统通知。`feedback_no_emoji_code.md` 规则扩展覆盖整个站点 UI。

### 移除

- Tools 页面「导入工具」tab —— WordPress XML 一次性导入已被「同步」插件流程完全取代，且没有 Typecho XML 标准，去掉避免误导。
- `coding_github_token` DB 选项 + 后端兼容读取分支（迁移到 `github_access_token`）。
- `vinyl-spin` keyframe + `.vinyl-spinning` / `.vinyl-paused` CSS 类（admin 无消费者，孤儿代码）。
- 4 处手写 SVG 12 圆点环 loading + Button 内 96×96 齿轮 SVG + 5 处 `fa-circle-notch fa-spin`（全部统一为 `fa-spinner fa-spin`）。

## [2.3.10] - 2026-05-09

### 修复

- **后台升级"提示了升级失败"但实际升级成功**：`SystemUpdatePanel.tsx` 的 `pollStatus()` 调 `verifyUpgradeApplied(expected, 60)` 写死 60s 超时，但真实升级流程包括 sidecar 拉镜像（~30s）+ 重建容器（~5s）+ 新 api 启动 + DB 初始化 + cron 启动（~15s）+ utterlog.io 缓存同步（~10s），总计经常 60-90s。导致升级实际还在跑，UI 已经报"升级未生效"。本次超时 60s → 240s（verify 内部命中任一成功信号就立即 return，加长只惩罚真失败，不延后真成功的反馈）。
- **错误语气分级**：之前所有 verify 失败都用红色 `toast.error('升级未生效 — ...')` 吓到用户。改成三档语气：
  - 网络/鉴权报错 → red error 保留（真坏了）
  - api 在响应、commit 已变（升级 OK，仅版本号字串没匹配，比如 docker label `version=main` 跟 BuildVersion `v2.3.10` 不对齐） → blue **info** "升级已应用，commit 已更新到 xxxxxxx，但版本号自动确认超时"
  - api 在响应、版本号没变（registry 没同步）→ yellow **warning** "升级超时未确认，等几分钟刷新再看"
  - 容器仍在旧版本（真没升级成功）→ red error 保留

## [2.3.9] - 2026-05-08

### 修复

- **后台升级在自定义安装路径下"未找到 docker-compose 文件"**：v2.3.3 加的 `probeComposeWorkingDir()` (用 docker compose label 自动探测真实安装目录) 实际从来没被触发，因为 `docker-compose.yml` 默认 `UTTERLOG_INSTALL_DIR=${UTTERLOG_INSTALL_DIR:-/opt/utterlog}` 让 env 变量永远非空，老逻辑「env 优先 → 非空就直接用 → label 探测被跳过」导致用户装在 `/opt/utterlog-pancn/`、`/root/my-blog/` 等任何非 `/opt/utterlog` 路径时升级一律拿到错的 `/opt/utterlog` 然后报错。本次调整优先级 → docker compose label > env 变量 > `/opt/utterlog` 兜底。compose label 是 docker compose 自己起容器时打上的最权威路径，永远准确；env 变量退到 fallback（万一 label 探测失败 / docker socket 不可用时仍能用）。日志里也明确标出来源（`(来自 compose label)` / `(来自 UTTERLOG_INSTALL_DIR env)` / `(兜底默认)`）方便排查。

## [2.3.8] - 2026-05-08

### 优化

- **coding 缓存键加版本号 `v2` —— 强制让旧形态缓存失效**：本次后端 contributions 数据从「自然年 Jan-Dec」形态改成「rolling 365 天」形态，但 Redis 缓存保留 30 天 stale-while-revalidate，旧 key 命中会继续返回旧形态数据 → 用户升级后看到的还是 ~19 周老视图。`coding.go` 加 `codingCacheVersion = "v2"` 常量并把它前缀到 cache key 上 (`v2:<usernames>:<repos>:<token>`)，旧 `<usernames>:<repos>:<token>` 形态的 key 全部失配，新代码冷启动就拉新数据，30 天 stale 期里那些条目自然 TTL 失效不再占用。未来 contributions 形态再调时把版本 bump 到 v3 / v4 即可。
- **后端 coding contributions API 改成 rolling 365 天（修复"数量不对"）**：v2.3.5 前端把热力图改成 GitHub-style "今天落在最右、往前 1 整年"（53 周 / 12 个月）排版，但后端 `coding.go` 的 `currentYearContributionRange` / `emptyCodingContributions` 一直只取「自然年 Jan 1 到今天」(年中访问时只 ~18 周数据)，前端 `rollingDays` 过滤后只剩这一小段 → 热力图实际只渲染 ~18 列，看起来"数量不对，没有完整显示出来"。本次新增 `rolling365Range(now)` helper 返回 `[今天 - 364, 今天]`，`fetchGitHubContributionCalendar` 改用它向 GitHub 拉数据；`emptyCodingContributions` 同步改成 365 天 rolling 占位底盘。前端 53 周自动撑满，跨年边界正常。GraphQL `contributionsCollection` 接受任意 from/to 区间，跨年没问题。
- **coding 热力图等分页面宽度（12 个月 / 53 周）**：v2.3.6 / v2.3.7 一直用 `min-width / max-width 720~740 + gap 3-4px` 的 grid 布局，整张图被强制锁在 720~740px，跟页面内容区宽度脱节；某些容器里 cell 还会被拉到 60+px。本次彻底重写：`globals.css` 的 `.coding-heatmap` 改成 flex 布局，`.coding-heatmap-week { flex: 1 0 0 }` 53 个 week 等分父级宽度，cell 走 `width: 100%; aspect-ratio: 1` 自然变方块。整张图自动撑满页面内容区不留白边、不出现横滚（Nebula 960px 容器 cell ~15px / Azure ~1300px 容器 cell ~22px / 各主题随自己页面宽度变化），跟 archive 页 `.nebula-heatmap` 同款行为，cell 尺寸跨页面自动一致。各主题之前 v2.3.7/v2.3.8 加的尺寸覆写（Azure / Chred / Flux / Nebula / Renascent / Utterlog 6 份各自的 `min-width / max-width / gap !important`）全部移除。`page.tsx` 在 `.coding-heatmap` 元素上 inline 设的 `gridTemplateColumns` 在 flex 容器下被自动忽略，无需改 React。
- **Nebula 通用页宽度回到 960px**：v2.3.6 把 tags / categories / archive / search / links 这些页的容器从 960 临时拉到 1200，但跟 Nebula 首页 / 文章页 / coding 页统一的 960px 内容栏宽度对不上，破坏了全站视觉统一感。本次回退到 960px，跟其他页面对齐。tags / categories 多 chip 时换行多一些，但视觉一致优先。
- **Nebula footer 默认高度跟 header 对齐（64px）**：v2.3.6 footer 用 `min-height: 86px`，跟 header 的 `.nebula-header-inner height: 64px` 不齐。本次 footer `min-height: 86 → 64`、`padding 10/10`（v2.3.6 是 16/13）—— 默认无备案号 / 单行内容时跟 header 完全对齐；有备案号 / 多行内容时 min-height 不限制上界，内容自然撑开。

### 修复

暂无。

### 移除

暂无。

## [2.3.7] - 2026-05-08

### 修复

- **全主题 coding 页热力图尺寸 GitHub-style 收口**：globals.css 之前 `.coding-heatmap` 只有 `min-width: 920px` + `width: 100%`、没有 `max-width`，53 列 cell 在 Azure 1304px 内容区里被拉到 ~20px 巨型方块，远比 GitHub 真实贡献图（~11px）大。Nebula 之前自己写了一份 `min-width: 720 + max-width: 740 + gap: 3` 的覆写绕过这个问题，但其他主题没动。本次把 GitHub-style 紧凑（`min-width: 740 / max-width: 740 / gap: 3px`、`.coding-heatmap-week` 同 gap 3px）写进 globals.css，全主题共用一份；Nebula 那份覆写删掉避免漂移，仅保留绿色阶梯颜色覆写。
- **非 Nebula 主题（Azure / Chred / Flux / Renascent / Utterlog）的友链页 / 订阅页错位**：v2.3.1 把这两个共享客户端组件 (`web/app/(blog)/feeds/FeedsClient.tsx` / `web/app/(blog)/links/LinksClient.tsx`) 重做成 toolbar + className 驱动的新布局（`feeds-toolbar` / `feeds-view-toggle` / `feed-card-*`、`links-toolbar` / `links-view-btn` / `links-group-tab`），但相关 CSS 只在 `web/themes/Nebula/styles.css` 里写了，没给其他主题留 baseline。Azure / Chred / Flux 等渲染时拿不到任何样式 → toolbar 按钮散落 + 卡片裸奔。修复：把每个客户端组件拆成 `Nebula*View`（v2.3.x 新版本）+ `Legacy*View`（v2.3.0 inline-style 版本），原 `FeedsClient` / `LinksClient` 改成 `useThemeContext()` 主题分发器，Nebula 走新版、其他主题走老版。老版纯 inline 样式不依赖任何主题 class，跨主题安全；Nebula 版的视觉特性 (toolbar / 视图切换 / 随机骰子) 完全不污染其他主题。

### 移除

暂无。

## [2.3.6] - 2026-05-07

### 新增

暂无。

### 优化

- **升级流程 compose 文件双源拉取**：sidecar 之前只从 `utterlog.io/docker-compose.yml` 拉，下载失败就跳过。现在 utterlog.io 不可达时自动 fallback 到 `https://raw.githubusercontent.com/utterlog/utterlog/main/docker-compose.yml`；两源都不可达才放弃刷新（仍能继续后续的镜像拉取流程）。新封装 `try_fetch_compose()` 助手函数统一处理 HTTP/合法性校验，日志里清晰标出主源 / 兜底源命中情况。
- **升级流程镜像拉取双源策略**：默认 `registry.utterlog.io/utterlog/utterlog-{api,web}`；若 `docker compose pull` 失败（注册中心维护、网络抖动、限流），sidecar 自动 `export UTTERLOG_IMAGE_PREFIX=ghcr.io/utterlog` 重试一次 —— GHA 的 `docker-publish.yml` workflow 把每个 release 的镜像同时推到这两个 registry，GHCR 能完整顶替 registry.utterlog.io。注意要 `export`（不只是赋值）这样后面 `docker compose up -d` 子进程才会读到同一个 prefix，避免「拉了 ghcr 的但 up 时又去找 registry.utterlog.io」的不一致。两源都失败才报 `[TASK-END]` 退出。
- **Nebula coding 热力图视觉压缩回到 v2.3.4 紧凑感**：v2.3.5 把日期范围从「自然年 1/1~12/31」改成 rolling 365 天，年中访问从 ~20 周变成满 53 周，整张图占满 960px 内容区，视觉上比之前大得多。Nebula 加覆写：`.coding-heatmap` 的 `min-width` 920 → 720、`gap` 4px → 3px、加 `max-width: 740px` 不让它再撑满全宽；`.coding-heatmap-week` 同步把 gap 改 3px。单格回到 GitHub-style 的 ~11px，整体视觉跟 v2.3.4（部分年渲染）的紧凑感对齐。功能（rolling 365 天）保留不变。
- **Nebula footer 整体降 10%**：v2.3.5 用 `min-height: 96px` + `padding 18/14`（总 32px）解决「无备案号站点 footer 看着像被踩扁」，但放在已经有备案号 / 多行内容的站点上偏高了。本次 `min-height` 96 → 86、`padding-top` 18 → 16、`padding-bottom` 14 → 13（总 29px）—— 三个值各降约 10%，无备案站点底线仍稳定不踩扁，有备案 / 内容多的站点不再显得头重脚也重。
- **Nebula 首页"最新评论者头像墙"屏蔽管理员**：`LatestCommenters.tsx` 之前用 `exclude_admin=0` 把博主自己的评论也算进来，头像墙第一个永远是博主，喧宾夺主。改成 `exclude_admin=1`（API 端按 admin email + `user_id != 1` 双重过滤），只展示访客社区氛围；`per_page` 同步从 40 提到 60 留缓冲，dedup 后仍能稳定凑齐 20 个去重头像。

- **Nebula tags / categories / archive / search 等通用页 max-width 960 → 1200**：之前 960px 在 tags 页 chip 多时被迫频繁换行；archive / search / links 在大屏上左右留白偏宽。统一拉到 1200px，文章页（`.nebula-article` / `.nebula-post`）保持自己的窄栏不受影响。
- **Nebula 短内容页页脚贴底**：之前 `.nebula-main` 是默认 block 布局，短内容页（tags 空、categories 几个、search 无结果）`<Footer>` 浮在页面中部，下面一大片黑。改成 `display: flex; flex-direction: column`，`.nebula-frame` 加 `flex: 1 0 auto` 占满剩余高度把 footer 顶到视口底；内容长时 frame 自然撑开不影响。
- **全主题：侧栏 / 首页分类导航过滤掉 0 篇文章的分类**：之前侧栏 / 首页中部 hero tabs / 分类筛选条都直接 `categories.map` 渲染，新建但还没分配文章的分类（count = 0）会作为"空目录"留在 UI 上喧宾夺主。覆盖范围：Azure / Chred / Flux 的 `Sidebar.tsx`「文章分类」区（全部为空时整段隐藏）、Azure / Chred / Flux 的 `HomePage.tsx` hero 左侧 tabs、Nebula 的 `nebula-category-strip` 中部分类筛选条、Renascent 的 `renascent-category-strip` —— 统一在渲染前 `filter(c => (c.count || 0) > 0)`，并把 `allTabs` / `tabCount` / 自动轮播下标基数 / 边框最后一项判定 等所有依赖原 `categories.length` 的地方改成 `visibleCategories.length`，保证活跃 tab 索引、auto-rotate cycle、hero 高度全部跟实际渲染对齐。Azure 自定义 sidebar 路径里 admin 配进菜单的 0 count 分类也单独 `return null` 跳过。

- **Nebula 足迹页 Mapbox 底图改暗色 (dark-v11)**：之前 `FootprintMap.tsx` 把 style 写死 `mapbox/light-v11`，在 Nebula 暗主题里像页面中间嵌了一块大白板，跟周围撞色刺眼。改成 `useThemeContext()` 读 `theme.name`，命中 Nebula 时切到 `mapbox/dark-v11`；高亮国家的填充色 `#4f9cff → #80cfff` (Nebula sky 系)，描边色 `#0052d9 → #80cfff` 并把 opacity 从 0.18/0.38 提到 0.22/0.55，确保深底上仍能看清。`mapStyle` 加进 `useEffect` 依赖数组，主题切换会重建地图。Nebula CSS 同步加 `.footprint-mapbox-popup` 适配：popup tip 小三角（mapbox-gl 默认写死白色）按 8 个 anchor 方向各自翻成 `var(--nebula-card)`、popup 内容外层换蓝细边 + 更深的阴影、卡片分隔线翻深、hover 用 sky 蓝半透。
- **Nebula 通用页标题字体改 PingFang SC 栈**：`.blog-page-title-text` 之前用 `var(--nebula-font-display)`（Google Sans Display 英文优先 + 系统字体 fallback），中文标题在 macOS 上回退到 SF/Helvetica 字形偏单薄。改成 `'PingFang SC', -apple-system, ..., 'Microsoft YaHei', 'Noto Sans SC'` 栈，中文标题字形规整紧凑跟 macOS / iOS 系统字体一致；Windows / Android 走 YaHei / Noto SC 兜底；`.coding-page-title` 仍保留自己的 display 字体（页面定调不一样）。

### 修复

- **Nebula 首页文章每页数量没跟 admin `posts_per_page` 设置走**：`web/themes/Nebula/HomePage.tsx` 顶部写死 `const PER_PAGE = 10`，server 端 `/app/(blog)/page.tsx` 已经按 admin 选项 `posts_per_page` 拉了 SSR 首屏数据并把 `perPage` 作 prop 传过来，但 Nebula 完全忽略这个 prop。后果：admin 配 6 篇/页时 SSR 首屏 6 篇 + totalPages 按 6 算，但点分类筛选 / 翻页时 AJAX `fetchPage` 用 PER_PAGE = 10 重新拉 → 数量对不上、totalPages 也错位。修复：删掉模块级常量，析构 `perPage = 10`（fallback 跟 server 一致）作 prop，`fetchPage` 和 PostCard `index={(page-1) * perPage + index + 1}` 全部改用 prop 值。
- **Renascent 首页 PostCard 序号跨页冲突**：`(page - 1) * posts.length + index + 1` 在末页只显示 N 篇时（N < perPage），从下一页第一条会重新从前面的小数字开始，跟前页编号撞车。`posts.length` 是当前页实际数量不是固定值，根本不能当步长。改用 `perPage` 作步长，类型上 `perPage?: number` 早就声明了但一直没解构进函数体；这次解构 + 替换。
- **Nebula 说说工具栏"说说"标题客户端导航后变深灰看不见**：`MomentsClient.tsx` 的 `<span>说说</span>` 写的是 inline `color: #1a1a1a`，Nebula CSS 用 `[style*="color:#1a1a1a"]` 属性选择器翻成白。SSR 直接进 `/moments` 时 HTML 串里就是 `#1a1a1a` 选择器命中没问题；但用户从首页客户端路由跳过去时，React 在 DOM 上重设 inline style，浏览器把它规范化成 `rgb(26, 26, 26)` —— 原选择器失配 → "说说" 仍是 #1a1a1a 深灰，跟 Nebula 暗背景撞色几乎看不见，必须强制刷新才白。修复跟 v2.3.5「moments-tag-chip / moments-month-chip / moments-year-btn 改用类钩子」同思路：`<span>说说</span>` 加 `className="moments-toolbar-title"`，Nebula 用 `[data-theme="Nebula"] .moments-toolbar-title { color: var(--nebula-white) !important; }` 强覆盖；inline-style 属性匹配保留作兜底，并补 `rgb(26, 26, 26)` / `rgb(26,26,26)` 两种规范化形态，万一旧 SSR 缓存 / 旧 client 的 HTML 没带 class 也能命中。

### 修复

暂无。

### 移除

暂无。

## [2.3.5] - 2026-05-07

### 新增

- **后台升级日志改成模态框**：之前内联在升级面板中部，体验像"在页面里塞了一段终端"。改成 `<Modal size="xl">`，自带顶部状态条（spinner / ✓ / ✗ + start time）+ 60vh 高度可滚动正文 + 底部蓝色扫光进度条。模态框关闭后页面留一个"查看升级日志"按钮，状态还在的话能随时重开。
- **升级日志动态滚动 + 飘入动画**：每条新行 `class="upgrade-log-line"` 触发 `upgradeLogLineIn` 关键帧（opacity 0→1 + translateX -4px→0，0.28s ease-out）；`useEffect` 在 `log_tail` 变化时调 `scrollIntoView` 平滑滚到末尾哨兵，最新一行始终在视口里（docker / k8s logs 经典体验）。`prefers-reduced-motion: reduce` 用户偏好下自动关掉动画。
- **Nebula 菜单声明从 `footer` 改成 `category`（中部分类导航）**：admin 在「主题 → 菜单 → 分类导航」配的菜单项现在驱动首页中间的分类筛选条；不配时仍回退到自动列出所有分类（向后兼容）。

### 优化

- **Coding 页面热力图改成 rolling 365 天**：之前按"自然年 1/1 ~ 12/31"排版，5 月落在中间不符合 GitHub 风格。改成今天落在最右、往前数 365 天。
- **Nebula 文章 `<strong>` 加粗效果**：`font-weight: 600` → `700`（系统字体 / Google Sans Display / Noto Sans SC 都加载了 700 weight），`<b>` 标签也加进选择器。之前 600 + 颜色跟正文同色 `--nebula-white`，加粗几乎看不出。
- **评论提交后页面无感更新**：CommentList 的 `fetchComments` 加 `mode` 参数（initial / switch / silent），提交回复后走 silent 模式 —— 列表保持显示、新数据无缝替换、不显示 loading 骨架、不强制 smooth-scroll 到顶部。WordPress 风格"原地多一条卡片，其它结构不动"。
- **Nebula footer 没备案号时高度偏低**：`.nebula-footer` 加 `min-height: 96px` + flex 垂直居中，`.nebula-footer-row` 上下 padding 提到 18/14。无备案号站点 footer 不再像被压扁了。
- **后台版本号实时同步**：VersionBadge 之前用模块级 in-memory cache TTL 10 分钟，升级成功后左上角 pill 仍显示旧版本号要等 10 分钟或刷新页面。新增事件总线 `admin:version-changed`：SystemUpdatePanel 升级成功时 dispatch，VersionBadge 监听后立即清缓存 + 重拉。
- **后台铃铛红点实时同步**：之前 NotificationBell 60s 轮询，审批评论后红点不消失要等下一轮。新增事件 `admin:notifications-changed`：Comments 页面 `fetchCounts` 完成后 dispatch（覆盖审批 / 拒绝 / 删除 / 移到垃圾箱 / 恢复 全场景），铃铛立即重拉。保留 60s 轮询作为兜底。
- **后台路由切换不再全屏闪**：Suspense fallback 从 `<Spinner overlay />`（全屏遮罩）改成 `<RouteFallback />`（仅顶部 2px 蓝色不定进度条 + 透明主区域）。1.7MB 的 Analytics chunk 加载中也只有顶部一道扫光，侧栏 / 头部保持可见，体感顺滑。
- **Nebula 说说工具栏图标初始灰色 bug**：CSS 写的 `[style*="color:#7a7670"]`（无空格）跟 React 实际序列化的 `color: #7a7670`（带空格）匹配不上 → 图标保持原色 #7a7670 灰，强制刷新才白。修复：每条 inline-style 选择器都补带空格的版本 + 加 `i` 大小写不敏感标志。
- **Nebula 说说标签 / 月份弹出卡片配色**：之前用 inline-style 字符串匹配（不可靠），改用类钩子 `.moments-tag-chip` / `.moments-month-chip` / `.moments-year-btn`（含 `.is-active`），CSS 用类选择器强覆盖。默认半透白底 + 半透白字、选中态用 sky 蓝底 + navy 深字。
- **Changelog 渲染支持 GFM 表格 + 分隔线**：admin 后台和 utterlog.io/changelog 同步修复，`renderChangelog()` 加 GFM table parser → 输出 `<table class="changelog-table">`（紧凑边框 + 表头浅灰底 + zebra 行）；`---` 分隔线 → `<hr/>`。
- **后台"更新内容"标题只显示版本号**：`{info.latest.name || info.latest.version}` → `{info.latest.version}`。GitHub release name 经常带长描述，标题里啰嗦。
- **utterlog.io 静态版本代理**：utterlog-landing 站构建期生成 `public/api/version.json` + `public/api/releases.json`，所有用户的 utterlog 后台改成查 `https://utterlog.io/api/version.json`，不再直接打 GitHub API。N 个用户共享同一份 CDN 缓存，配额从 60/h（匿名共享 IP）→ 实质无限。GitHub API 仍是 fallback。
- **`version_source_url` admin 选项**：私有部署 / 企业 fork 可指向自己的 mirror（指 `<url>/api/version.json` 兼容 schema）。

### 修复

- **管理员评论 / 回复邮件诊断日志**：之前修复了管理员评论早返回不发邮件，但用户报告偶尔仍发。在 `sendCommentNotifications` 增加两条 `log.Printf` 诊断日志：命中 admin 跳过时输出"skipped — sender is admin"，没跳过时输出 `role / user_id / senderIsAdmin` 完整字段。下次出现可以直接看日志定位是 DB JOIN 没拿到 role 还是别的代码路径。

### 移除

- 暂无。

## [2.3.4] - 2026-05-07

### 新增

- **版本检查走 utterlog.io 自家代理（不再依赖 GitHub API）**：之前每个用户的 admin 后台都直接打 `api.github.com/repos/utterlog/utterlog/releases/latest`，匿名 60/h 配额（按 IP 计）经常爆 → 403 → 升级面板看不到新版本号。新架构：utterlog-landing 站构建期跑 `scripts/build-api-cache.js`，用 GitHub Actions 的 `GITHUB_TOKEN` 拉一次 release 列表，写到 `public/api/version.json` 和 `public/api/releases.json` 静态文件 → next build 自动导出 → Cloudflare CDN 缓存。所有用户的 utterlog 后台改成查 `https://utterlog.io/api/version.json`，**单一 token 在 landing 上，N 个用户共享同一份缓存，永远不会 rate-limit**。用户**不用配任何 GitHub Token**，开箱即用；国内访问也比直连 `api.github.com` 快得多。GitHub API 仍然是 fallback，主路径失败时自动切换。
- **`version_source_url` admin 选项**：私有部署 / 企业 fork 想用自己的 mirror，可以在 admin options 加 `version_source_url`（如 `https://your-mirror.example.com`），代码会自动去 `<url>/api/version.json` 拉取。空 → 用默认 utterlog.io。

### 优化

- **升级日志输出格式参考 1Panel**：原 `[2026-05-07T15:30:20Z] sidecar starting in /opt/...` 改成 `2026/05/07 23:30:20 升级应用 [Utterlog] 任务开始 [START]` 风格 —— 时间戳本地时区 + 中文动作 + `[对象]` + 状态/`[标记]`，每一步语义清晰。容器名（`[utterlog-pancn-api-1]`）、安装目录、镜像 tag、digest 全部动态显示在日志里，肉眼能确认探测正确。
- **后台升级日志面板高亮**：`SystemUpdatePanel.tsx` 新增 `highlightLogLine(line)` 函数，按语义着色：时间戳 → 暗灰 / `[START]` `[TASK-END]` → 琥珀加粗 / `[xxx]` 容器名/路径/镜像 → 天蓝 / `成功` → 亮绿 / `WARN` → 黄 / `ERROR` `失败` → 红。容器外观也调整：背景 `#0f172a` → 更深的 `#0a0e1a`（终端感）+ 圆角 6px + 顶部状态徽标分割线 + max-height 280 → 360px。
- **GFM 表格在 changelog 渲染中支持**：admin 后台 `SystemUpdatePanel.tsx` 的 `renderChangelog()` 之前不识别 `| col1 | col2 |` + `|---|---|` 表格语法，release notes 里的对比表都显示成原文 raw 字符。补上 GFM table parser → 输出 `<table class="changelog-table">`，新增 CSS（紧凑边框 + 表头浅灰底 + zebra 行）。`---` 分隔线 → `<hr/>` 也补上。utterlog-landing 的 `app/changelog/page.tsx` 同步修复。
- **后台升级面板"更新内容"标题只显示版本号**：`{info.latest.name || info.latest.version}` 改成 `{info.latest.version}`。GitHub release name 经常是 `v2.3.3 — upgrade works on any compose project name` 这种长描述，标题里啰嗦。现在固定显示 `更新内容 — v2.3.3`。

### 修复

- 暂无。

## [2.3.3] - 2026-05-07

### 修复

- **后台一键升级在自定义 compose 项目名下静默失败**：sidecar 脚本写死 `docker inspect utterlog-api-1`，但 docker compose 给容器命名是 `<project>-<service>-<index>` —— 项目名取决于安装目录的 basename（或 `COMPOSE_PROJECT_NAME` env / `name:` 字段）。装在 `/opt/utterlog-pancn/`（1Panel 默认）/ `/root/my-blog/` 等任何非 `/opt/utterlog/` 路径，容器都叫 `utterlog-pancn-api-1` / `my-blog-api-1`，全部 `docker inspect` 调用都拿不到容器，健康检查 120s 干等到超时，admin UI 报 "升级未生效"。
- **修复方案**：`api/internal/handler/system_version.go` 新增 `apiContainerName()` 助手 —— api 进程用 `os.Hostname()`（docker 默认把 hostname 设成短 ID）+ `docker inspect <id>` 反查自己的真实容器名；`webContainerName(api)` 通过 `com.docker.compose.project` label 反查同项目里的 web 容器。所有原本写死 `utterlog-api-1` 的地方（`probeComposeWorkingDir` / `probeAPIUploadsMountSource` / sidecar 健康检查 loop / sidecar 终态 digest 输出）改成用动态名字；sidecar 启动时通过 `API_CONTAINER` / `WEB_CONTAINER` 环境变量传递。
- **覆盖面**：未来任何用户不管装在哪个目录、用什么 compose project 名（`utterlog` / `utterlog-pancn` / `my-blog` / 大写小写下划线），后台升级按钮都能找到自己的容器、正确执行 pull / recreate / health check。
- **GitHub API 403 rate-limit**：`api/internal/handler/system_version.go` 三个 GitHub API 调用（`releases/latest` / `releases?per_page=20` / `commits/{tag}`）都没鉴权，云出口共享 IP 的 60/h 匿名配额一打就爆。新增 `applyGitHubHeaders(req)` 助手，admin 配了 `github_access_token` / `coding_github_token` 时自动加 `Authorization: Bearer ...`，配额从 60/h 涨到 5000/h。403 错误信息也明确化（提示去后台填 token），不再是裸的 "github API 403: ..."。
- **后台升级面板"升级未生效"误报**：`SystemUpdatePanel.tsx` 的 `verifyUpgradeApplied` 之前只看 version 字符串严格相等，dev 安装（BuildVersion='dev' 永不变）/ 生产 `:latest` 还没同步 / 用户 compose 锁定具体 tag 这些场景都会被卡 60s 然后误报 "升级未生效"。改成三层成功信号（version 等式 / commit 变化 / built_at 变化）任一命中即成功，超时 60s → 180s，错误信息显示实际拿到的 version + commit。
- **生产 named volume 模式下 sidecar 日志看不到**：`docker-compose.prod.yml` 用 `uploads:/app/public/uploads`（命名卷），api 读卷里的 upgrade.log；sidecar 写到 `$INSTALL_DIR/uploads/upgrade.log`（宿主目录），两个完全不同的物理文件，admin 看不到 sidecar 真实输出。新增 `probeAPIUploadsMountSource()` 探测 api 容器 `/app/public/uploads` 的实际挂载源（bind 返宿主路径 / volume 返卷名），api 启动 sidecar 时把同一个源也挂载给 sidecar（`-v <source>:/api-uploads` + `API_UPLOADS_DIR=/api-uploads`），双方写读同一个文件。
- **安装目录写死 `/opt/utterlog`**：`runUpgrade()` 之前默认 `installDir = /opt/utterlog`，1Panel 装在 `/opt/utterlog-pancn/` 或自定义路径直接报"找不到 docker-compose 文件"。新增 `probeComposeWorkingDir()` 用 `com.docker.compose.project.working_dir` label 自动探测真实路径，环境变量 / 兜底逻辑保留。
- 停留在 v2.3.2 及更早版本的用户需在服务器上手动跑一次 `docker compose pull && docker compose up -d` 摆脱旧容器名探测 bug，后续升级恢复一键。

## [2.3.2] - 2026-05-07

### 新增

- **Nebula 顶部进度条 `<TopProgress />`**：拦截全站 `<a>` 点击 + `popstate`，路由切换时顶部 2px 蓝色进度条带流光动画爬到 90%、`usePathname` 变化后跳到 100% 淡出；10s 兜底超时；支持 capture 阶段拦截，避免被业务 `stopPropagation` 截掉。
- **首页分类 tabs stagger fade-in**：切分类时旧卡片留位 + `.is-loading` 半透明，新数据回来用 `nebulaListItemIn` 关键帧错峰 30ms 飘入；按钮 hover `translateY(-1px)`、`:active` `scale(0.96)` 弹簧反馈；`prefers-reduced-motion` 自动关掉动效。
- **Nebula footer 回到顶部按钮**：贴在 footer 右内边距 20px、垂直居中、container 之外，36×36 squircle + 毛玻璃 + 蓝细边；滚动 ≤ 400px 时 visibility:hidden 占位不抖动；hover scale(1.12)。
- **Header logo / 站名 hover 中心放大**：logo 图块 / 渐变 mark / 纯文字站名都加 `transform-origin: center` + 弹簧 cubic-bezier 过渡，hover 1.15x；纯文字模式 `display: inline-block` 让 transform 生效。
- **/search 搜索结果页与 header 弹出搜索框样式统一**：input 44px 胶囊形 + 左 leading 放大镜 + sky 蓝胶囊 submit 按钮（深底字），共用一套 Nebula 视觉语言。
- **Nebula 段落点评弹窗改 `position: fixed`**：基于 trigger `getBoundingClientRect` 实时计算 `left/top`，监听 `.blog-main` + window 滚动 + resize 同步跟随；视口右溢出自动左移、最左 12px 安全边距。彻底脱离文档流，不被父级 overflow 裁切，绝不影响段落 box。
- **OG / Twitter Card 图片兜底**：`/[...permalink]` 路由原本只设 title/description，没 og:image —— 社交平台分享出来一直是占位卡片。现在跟 `/posts/[slug]` 一样用 `post.cover_url` 优先 + `randomCoverUrl(post.id)` 兜底，X / Telegram / 微信抓出来都有大图特色封面。

### 优化

- **代码块底色 `#0a0d14`**：之前 `--nebula-input` 是 `#121212`，跟文章卡片底色 `#131314` 仅差 1 个亮度档，代码块边界肉眼看不出来。改成更深的蓝调近黑（GitHub-style 嵌入感）。Prism token 配色（蓝/绿/橙/黄）在新底色上对比度更高、更易读。
- **页脚四个图标按钮统一成"logo 框"风格**：音乐 / RSS / Utterlog logo / 登录 全部 24×24 squircle + `border: 1px solid rgba(128,207,255,0.2)` + 半透深底，图标 16×16 居中。RSS 图标从 `fa-square-rss` 换成 `fa-rss`（外层方框已由按钮自身提供，避免方中带方）；登录占位 `fa-light fa-user` → `fa-solid` 跟其它视觉重量对齐。删掉了之前重复声明 `.nebula-footer-auth-btn` 的旧规则（让登录按钮用统一规则）。
- **Footer 已登录菜单对齐**：`.nebula-footer-login-menu-item` 全部规则加 `!important`（特异性 0,2,0），覆盖 `.nebula-footer-links a` (0,2,1) 偷过来的 `padding: 4px 8px / gap: 4px / font-size: 12px`。现在 `<Link>(a)` 和 `<button>` 两种 tag 视觉完全一致：相同 padding/gap、图标固定 16px 列宽、基线对齐。
- **ICP 备案盾形 icon 默认翻灰**：之前 `fill: var(--nebula-blue-accent) !important` 永久覆盖成蓝色，跟旁边备案号"默认灰、hover 高亮"的一致体验对不上。现在默认 `fill: rgba(225,231,238,0.5)` + hover 才恢复天蓝，加 `transition: fill 0.2s` 平滑淡入。
- **AIReaderChat 折叠卡片样式精炼**：右侧多余的 `fa-message-bot` 图标删掉；卡片 `border-radius: 12px` + `backdrop-filter: blur(20px) saturate(160%)` 毛玻璃 + 蓝细边；折叠态 hover 上抬 1px + 蓝边亮档 + 蓝光阴影；AI 角标 / 用户气泡 / 发送按钮全部翻 sky 蓝底 + navy 深字（跟"提交评论"按钮一致的对比策略）；推荐问题按钮加 hover 反馈。
- **AIReaderChat / AIChatBubble 取最后一个 `<footer>`**：Nebula 的 PostPage 里有内嵌的 `<footer class="nebula-post-foot">` 装文章 tags，DOM 顺序在主 `.nebula-footer` 之前。`querySelector('footer')` 拿到它就让陪读卡片去躲那个内层 footer，结果反而被推到视口顶部。改成 `querySelectorAll('footer')` 取最后一个。
- **AIReaderChat scroll-aware lift 加上限**：用 `cardRef` 实测卡片高度，`maxLift = viewportH - cardH - 16` 双向 clamp；`rect.top` 用 `Math.max(0, ...)` 兜底。在小视口 / footer 巨大 / footer 已滑过视口顶部等极端场景下卡片不再消失。
- **Nebula AI 聊天气泡（AIChatBubble）暗色适配**：用类钩子（`.ai-chat-bubble-fab` / `-panel` / `-msg--user|assistant` / `-input` / `-send` 等）整体翻深；浮标和发送按钮用 sky 蓝 + navy 深字；assistant 气泡半透蓝调 + 蓝细边。
- **段落点评弹窗暗色 + 抬升一档**：`.block-annotation-panel` 用 `#1a1d22`（比 `#121212` 浮起一档）+ 蓝细边 + 双层阴影 + 毛玻璃；输入框单独翻 `rgba(0,0,0,0.35)` 避免再次撞色。
- **LatestCommenters 头像去重**：之前用 `(author_name || author || author_email || id).toLowerCase()` 单一兜底字段，同一人不同评论里 name 大小写 / 空白 / 空缺不一致就 dedup 失效。改成 `email + name + avatar_url` 三键交叉判断，任一命中就跳过。
- **代码高亮 Prism token 配色**：之前 `pre code { color: var(--nebula-white) !important }` (specificity 0,4,2) 把 prism-tomorrow 所有 `.token.x` (0,2,0) 都吞掉，代码块一片白。去掉 white 强制覆盖 + 新增 Nebula 蓝调专属 token 调色板（keyword/string/number/property/tag/operator 各自配色）。
- **首页"边读边聊"卡片下沉避让 footer**：之前用静态 `footer.offsetHeight` 当 bottom，卡片永远悬浮在半空 + 滚到底盖住 footer 顶部（吃掉回到顶部按钮）。改成跟 MiniMusicPlayer 一致的 scroll-aware lift：默认 `bottom: 24` 贴底，footer 进入视口才上推。
- **字体托管全部转到 static.utterlog.com**：`Google Sans` / `Google Sans Text` → `Google Sans Display`（一套字重）；`Noto Sans SC` 也从 Google Fonts 换成自托管。Nebula 主题不再依赖 fonts.googleapis.com，国内访问更快。

### 修复

- **博主回复评论会发邮件**：`sendCommentNotifications` 的 reply 路径只检查 parent 是否 admin、不检查 sender 是否 admin。改成算完 `senderIsAdmin` 后直接 early-return，admin 的所有评论 / 回复一律跳过两条邮件路径。
- **评论邮件里访客信息不全**：原代码 `go LookupAndStoreGeo(...)` 和 `go sendCommentNotifications(...)` 两个 goroutine 并行起跑，邮件几乎一定先于地理查询完成 → 模板里 `{{.IPLocation}}` / `{{.CountryCode}}` 全空。改成同一个 goroutine 串行，邮件能拿到完整 IP + 国旗 + 城市/省份。
- **AIReaderChat × 关闭按钮无响应**：组件订阅了 `dismiss()` 但没读 store 的 `dismissed` 状态，也没调 `mount()`。补上 `useReaderChatStore(s => s.dismissed)` 订阅 + `mount()/unmount()` 生命周期 + `if (dismissed) return null`。点 × 立刻消失，强制刷新或切文章才会重新出现。
- **博主评论显示等级标签**：`comment.level && comment.level > 0` 没排除 admin —— 博主自带 crown 角标，又叠一个 `Lv.x` 标签视觉冗余。所有 5 处 CommentList 加 `!comment.is_admin` 排除。
- **首页 AIChatBubble 整体浅色**：组件 inline 写死白底 + #1a1a1a 字 + 蓝按钮白字，跟 Nebula 暗主题撞色。补上类钩子 + Nebula 暗色覆盖。
- **footer ICP 盾形图标默认显示蓝色**：`.nebula-footer-icp-icon path { fill: blue !important }` 之前永久覆盖，hover 没有变化。改成默认灰、hover 才蓝。
- **CommentForm 提交按钮蓝底白字看不清**：Nebula 主题的 `--color-primary` 是浅蓝 `--nebula-blue-accent`，浅蓝底上白字对比度差。加 `className="comment-submit-button"` 钩子 + Nebula 翻成 navy 深字。

### 移除

- **`<footer>` "重新打开陪读" 浮动按钮**：原本点 × 关闭后 footer 出现一个圆形 message-bot 按钮重新唤起卡片。按用户要求改为"关闭后只有强制刷新才重显"，简化交互。

## [2.3.1] - 2026-05-07

### 新增

- **Nebula 暗色科技主题**：电紫强调 + 深蓝表面 + 玻璃质感卡片 + 蓝调发光阴影。覆盖 Header（Alimama 方圆体 logo + admin `site_brand_mode` 联动）、首页（说说磨砂胶囊 + 4 个爱好图块 hover 弹跳 / 文字徽章 + 评论者头像墙 hover 弹评论详情 + 分类切换不变 URL + 统计 inline 在 § ARTICLES 行）、文章页（横幅嵌标题 + 思源宋体 h2-h6 + 苹方正文 + Google Sans Code 代码 / Prism + 右侧 fixed sticky TOC + H2 蓝胶囊徽章 + h3-h4 蓝方块前缀 + 表格行列双向网格 + 表头大写字距 + 评论 thread 包裹主评和回复气泡 + @mention popup 翻深色 + 边读边聊浮窗整套深色适配）、底部多行结构页脚（建站天数 + 总浏览 + 实时在线 + 最近访客地）。
- **足迹国旗装饰**：文章封面右下角自动显示该文涉及国家国旗（Nebula 主题 36×36 圆角，其他主题 50×50 不变）。
- **PostNavigation 友链卡随机封面**：RSS 拉不到友链文章特色图，改用 `randomCoverUrl(hashFeedSeed(link))` 取稳定的 img.et 占位图，每条 feed 用 djb2 哈希链接得到不同的整数 seed，刷新不闪、4 张卡 4 张图。
- **首页"最新评论者头像墙"**：首页底部一排圆头像（10–20 个，按昵称去重），hover 弹出磨砂玻璃 popup 显示该用户最新评论内容 + 文章标题 + 时间，点击跳到对应评论锚点。

### 优化

- **`randomCoverUrl` regex 放宽**：`[?&]r=\d+` → `[?&]r=[^&#]*`。之前 admin 设置 `r=abc` 等非数字 seed 时 regex 不匹配，会去 else 分支追加第二个 `r={id}` 参数，img.et 收到两个同名参数行为不可预测。现在任何 `r=<value>` 都会被替换成 `r={post.id}`，每篇文章拿到稳定唯一的随机封面。
- **AISummary 图标**：`fa-wand-magic-sparkles`（魔法棒） → `fa-microchip-ai`（AI 微芯片），更切题。共享组件，所有主题受益。
- **评论列表头像方→圆**：CommentList 三处 inline `borderRadius: 0` 全部改 `'50%'`，跟现代 UI 风格一致。共享组件。
- **PostNavigation 友链 tab 也按 `pageSize` 切片**：之前 feeds tab 不分页全部渲染，现在跟其他 tab 一样切片，Nebula 传 `pageSize={4}` 时友链卡也只显示 4 张。
- **CommentList / CommentForm / AIReaderChat 加 className 钩子**：`comment-card` / `comment-card--reply` / `comment-thread` / `comment-form` / `ai-reader-chat--collapsed` / `ai-reader-chat--open`，便于主题精准 override 而无需改 inline style。共享组件不动 inline 样式，其他主题不受影响。

### 修复

- 友链 tab 多张卡片可能拿到同一张占位图：原因是 `randomCoverUrl` 直接把整段 link URL 当 `r=` 传给 img.et，长 URL 被服务端截断或归一化后彼此变成相同 seed。修复见上面"`randomCoverUrl` regex 放宽" + 友链卡新加的 `hashFeedSeed()` djb2 哈希。

### 移除

- 暂无。

## [2.3.0] - 2026-05-05

### 优化

- **统计表前缀统一为 `ul_stats_`**:`ul_analytics_daily` → `ul_stats_daily`、`ul_visitor_dates` → `ul_stats_visitor_dates`、`ul_visitor_post_dates` → `ul_stats_visitor_post_dates`。`ul_stats_global` / `ul_stats_post_daily` 已是该前缀,本次对齐;`ul_access_logs` 不变(语义为"原始日志"非"聚合统计")。InitDB 自动 ALTER TABLE RENAME(IF 老表存在 + 新表不存在),老库平滑升级。
- **三个层面的"总访问量"统一口径**:footer `ArchiveStats` / 后台 `DashboardStats` / 后台数据统计页 `period=all` 全部走新增的 `handler.GlobalStats()` helper,直接读 `ul_stats_global` 单行 O(1)。之前 `DashboardStats` 用 `COUNT(*) FROM ul_access_logs` 会随 90 天 prune 而"变小"。
- 前端 `PageViewTracker` 删掉 `isAdmin` gate。v2.2.0 起后端"管理员也计入访问"是用户明确决定;前端再 gate 反而让管理员的浏览只 +view_count(走 SSR `?track=1` 路径)而不写 `access_logs`,造成"明细看不到管理员、但 view_count 涨了"的不一致。前后端口径统一为「全部都计入」。

### 移除

- `AccessLogger` middleware:函数体已退化为 `path filter + c.Next() + _ = path` 实际无副作用(v2.2.0 时为防与 `/track` 双计已停止写 access_log)。`main.go` 同步删 `r.Use(handler.AccessLogger())` 调用,以及只此一处用到的 `skipLogPrefix` / `assetExt` 常量。
- `CleanupBotLogs` / `CleanupBotLogsPreview` handler 与对应的两条 admin 路由(`POST /admin/analytics/cleanup-bots`、`GET /admin/analytics/cleanup-bots/preview`)。这是为旧版 `AccessLogger` 双写产生的"visitor_id 空、UA 真实"行清理用的工具,middleware 不再写,这种行也不再产生,无前端调用。
- `EnrichGeoIP` handler 与 `POST /analytics/enrich-geoip` 路由。`logAccess` 已经在写入时异步补 GeoIP,没有积压需要批量回填,亦无前端调用。
- `InitStatsSync()` 空 hook(v2.2.0 起只剩函数声明)以及 `main.go` 里的调用。
- `web/next.config.js` 的 `experimental.staleTimes` 配置:Next 16.2.4 默认 `staleTimes.dynamic = 0`,显式写 0 是 no-op,删除以保持配置最小化。

## [2.2.0] - 2026-05-05

### 新增

- **永久不丢失的实时统计系统**。新增 3 张永久不可删表：
  - `ul_stats_global`：1 行站点级累计计数器（`total_views` / `total_uniques` / `first_event_at`），footer "总访问" 现在 O(1) 读这里。
  - `ul_stats_post_daily`：每篇文章每日 PV/UV，文章历史曲线的来源。
  - `ul_visitor_post_dates`：每篇文章每日访客唯一去重表，per-post UV 的真相源。
- 站点 PV、文章 view_count、日聚合（`_total` 维度）现在事务化原子写入，单次访问一个事务，不再依赖每日 cron。
- 首次启动自动从历史数据回填 `ul_stats_global`：现存 `ul_access_logs` 行数 + `ul_analytics_daily` 中 prune 早期日期的 `_total` 聚合 + `ul_visitor_dates` 累计 distinct 访客。

### 优化

- footer "总访问量" 不再随 30 天 prune 而"变小"。`ArchiveStats` 接口由 `COUNT(*) FROM ul_access_logs` 改读 `ul_stats_global.total_views` 单行 O(1)。
- 站点 PV / UV / 维度日聚合改为**写入时实时累加**（UPSERT），不再等 cron。今日数字立刻可见。
- `rollupRetentionDays` 由 30 天提升至 90 天（`ul_access_logs` 热数据保留期）。永久数字现已在 `ul_stats_global` / `ul_analytics_daily`，`access_logs` 仅作"最近访客 / 维度 breakdown"的明细。
- 取消 `logAccess` 的 30 秒去重 + 60 秒速率闸（≥8 hits 拒绝），刷新就 +1。
- 取消管理员 skip：管理员自己访问也计入 PV / view_count。
- 取消文章 SSR `?track=1` 路径上的 `IsBot` UA 检查 —— 该路径 UA 永远是 Next.js 的 `node`，原检查导致每个真实访客的 SSR 渲染都被拦下不计数。bot 护栏保留在浏览器 `/track` 路径（UA 真实可信）。

### 修复

- 修复 `ul_posts.view_count` 与 `ul_stats_post_daily.views` 漂移的双计 bug：旧版 `logAccess`（浏览器 /track）和 `IncrPostViews`（SSR `?track=1`）都在累加 daily.views，一次 F5 文章被 +2。现 daily.views 由 SSR 路径独占。

### 移除

- 删除死代码 `IncrTotalViews()` / `GetTotalViews()` / Redis `stats:total_views` —— PV 真相已迁移到 SQL。
- `analytics_rollup` 不再聚合 `_total` 维度（由 `logAccess` 实时写入）；维度 breakdown（browser / os / device / country）仍保留 cron 滚动。

## [2.1.7] - 2026-05-04

### 优化

- **阅读数改为 WordPress 风格的服务端同步 +1**:文章详情页 SSR 拉取数据时(`/api/v1/posts/:id?track=1`)后端在同一请求里完成 `UPDATE view_count = view_count + 1` 并返回 +1 后的值,渲染出来的 HTML 数字就是新数字。
- **不再依赖客户端 /track 异步路径** 来统计阅读数,关 JS / 浏览器拦截 / 网络抖动也能正常计数,刷新页面就 +1 不丢。
- **整个数据流减少一次客户端请求**:文章卡片不再走客户端 fetch 实时拉数字(v2.1.6 的 `LiveViewCount` 客户端组件删除),完全靠 SSR 同步 +1 后的值。
- 后端 `/track` 现在只负责访客明细 / 在线访客 / 全站 PV 统计,不再 IncrPostViews,数据流更清晰。

### 修复

- 修复"点击进文章 → 阅读数 +1 → 回首页阅读数仍然是旧值"的体验问题。改造后:点击进文章时服务端就 +1,首页 SSR 直接读 DB 拿最新值;Router Cache / 浏览器缓存还可能让首页延迟刷新,但即便延迟,**数据本身是真实的**,而不是 v2.1.6 之前那种"客户端 +1 没成功 → DB 没真的改"的错位。
- 移除 4 个主题(Azure / Flux / Chred / Utterlog)文章页 cosmetic `+1` 显示逻辑(SSR 已经拿到 +1 之后的值,不再需要乐观补 1)。

### 移除

- 删除 `web/components/blog/LiveViewCount.tsx`(v2.1.6 引入的客户端 fetch 组件,被服务端 +1 取代)。

## [2.1.6] - 2026-05-04

### 修复

- 接续 v2.1.5 的修复。v2.1.5 设的 `experimental.staleTimes.dynamic = 0` 在 Next 16.2.4 实际是默认值,等于无操作,文章卡片在首页仍可能显示旧的阅读数。改成更直接的方案:新增客户端组件 `LiveViewCount`,每次卡片 mount 都向 `/api/v1/posts/<id>` 发一次 `cache:'no-store'` 的请求并把数字替换为最新值。Azure / Flux / Chred / Utterlog 四个主题的 `PostCard.tsx` 全部接入。无论 Router Cache、bfcache 还是浏览器其它隐性缓存,数字都会被客户端兜底更新。

### 移除

暂无。

## [2.1.5] - 2026-05-04

### 修复

- 修复点击进入文章后再回首页,文章阅读数 / 评论数显示不更新的问题(必须强制刷新才能看到新数字)。原因是 Next.js 客户端 Router Cache 默认对动态路由保留 RSC payload,导航回首页直接 replay 缓存,绕过服务端拉数据。`web/next.config.js` 加 `experimental.staleTimes.dynamic = 0`,强制每次导航重新拉数据;静态页面继续保留 5 分钟缓存。后端 view_count 和 /track 完全正常,本次只是前端缓存策略调整。

### 移除

暂无。

## [2.1.4] - 2026-05-04

### 新增

- 数据统计支持 6 个时间窗口:**24 小时 / 7 天 / 30 天 / 当年 / 近一年 / 全部**。后台 → 数据统计页右上角切换器对应新增 3 个长周期。
- 新增 `/api/v1/analytics/breakdown?period=&dimension=` 统一接口,返回任意时间窗口内的访问次数 / 唯一访客 / 浏览器 / 操作系统 / 设备 / 国家分布(含每项 ratio 比例)。`dimension=all` 一次性返回 4 个维度。

### 优化

- 数据保留架构改为分层:`ul_access_logs` 仅保留**最近 30 天**原始行,超期前会被聚合到永久表 `ul_analytics_daily`(每天每维度一行,带 visits + unique_visitors)。"全部 / 当年 / 近一年" 等长周期查询走 UNION(daily 聚合 + 最近 30 天 raw),保证历史数据永不丢失。
- 唯一访客在跨日窗口的精度问题:新增 `ul_visitor_dates(visitor_id, date)` 永久表,记录每位访客每天是否访问过。任意时间窗口的"唯一访客数"= `COUNT(DISTINCT visitor_id) WHERE date BETWEEN`,精确而非过计。
- 数据统计→**最近访客** 卡片限制为最近 7 天 + 上限 1000 条,卡片标题副文字加"最近 7 天 · 上限 1000 条"。
- 概览面板的浏览器 / 操作系统 / 设备 / 国家分布列表项 JSON 字段统一为 `{name, code, count, ratio}`(原先 devices 用 type、countries 用 country,字段名不一致),前端 IconStatList / CountryRow 同步更新。
- 启动时新增 `StartAnalyticsRollupCron()`,每 24 小时把昨天及更早的数据聚合到 daily 表,然后删 30 天前的 raw 行。幂等(走 ON CONFLICT DO UPDATE),重跑安全。

### 修复

暂无。

### 移除

暂无。

## [2.1.3] - 2026-05-04

### 新增

- 新增评论邮件支持 bilibili 表情:`[:slug:]` 标记现在会渲染为对应的表情图(共 40 个),适用于"新评论""待审核评论""评论回复"三类邮件,图片走站点 `/emoji/bilibili/` 静态路径。
- 新增评论邮件展示访客来源:昵称同行右侧显示国旗 + IP + 归属地(省市),邮箱 / 网址独立两行,正文下方右下角显示完整时间戳(`2026-05-04 11:32:18`)。昵称如果填了网址会变成可点击链接。
- 新增密码重置邮件展示申请来源:申请来源块在重置按钮下方,显示触发请求的 IP、归属地、国旗与精确时间,便于账号主人核对是否本人发起。
- 新增评论回复邮件的退订能力:回复通知邮件页脚左侧"不想再收到回复通知?点击此处退订",链接走 HMAC 签名的 `/api/v1/unsubscribe/comment-reply?e=…&t=…`,handler 验签后写入 `comment_reply_optouts_v1` option,后续给该邮箱的回复通知会被自动跳过。退订成功 / 链接无效都会渲染独立确认页。
- 新增 Azure 主题侧栏欢迎卡片右侧无缝衔接:卡片往右溢出 1px 覆盖 sidebar 灰色 border-right,蓝色卡片不再有"分割线撞文章"的视觉断层。

### 优化

- 邮件模板整体重设计:卡片 4px 圆角、隐藏右上角域名、品牌 logo + 站点标题首行加 `aria-hidden`/`user-select:none`,屏幕阅读器与系统朗读会跳过 brand 行直接读正文;站点标题使用阿里妈妈方圆体,英文 fallback 链使用 Ubuntu;Powered by 改为单行居中、`Utterlog!` 加粗带链接(指向 utterlog.io)。
- 邮件链接全部加 `target="_blank" rel="noopener noreferrer"`,在 webmail 里点击不会替换掉邮件视图。
- 邮件正文移除装饰 emoji(⚠ / 🔗 / 📝 / 🔐 / ⏳ / 🎉),由文本和颜色承担语义;`verify_code` 邮件的提示 ℹ 改为内联 SVG。
- 待审核评论邮件标题加上文章名(链接到对应文章),meta 行结构跟新评论邮件统一,删除底部冗余的"文章 / IP 归属 / 提交时间"卡。
- 邮件主题去掉装饰 emoji(💬 / 🔐),保留纯文本主题。
- `model.LookupGeo` 导出供非评论场景(如密码重置)直接拿 IP 归属信息,不再误调 `LookupAndStoreGeo` 写入 commentID=0。

### 修复

暂无。

### 移除

暂无。

## [2.1.2] - 2026-05-03

### 新增

暂无。

### 优化

暂无。

### 修复

- 修复文章评论中深层回复链被多次重复渲染的问题(后台数据库正常,只在前端显示)。原因是 `CommentRow` 在每一层都重新调用 `flattenReplies` 扁平化,深度为 n 的子评论会被渲染 2^(n-1) 次;现把扁平化只保留在顶层 `depth === 0`,递归层不再二次扁平。Azure / Flux / Chred / Utterlog 四个主题以及公共 `components/blog/CommentList` 五处统一修正。

### 移除

暂无。

## [2.1.1] - 2026-05-03

### 新增

暂无。

### 优化

- 优化文章页底部「友链更新」板块，后端改为从 RSS 订阅缓存随机抽取 5 条，前端卡片重新布局为左上角站点名、右上角发布时间、底部悬停显示文章标题与「阅读原文」入口；卡片复用 16:10 网格槽位，没有真实封面时使用渐变底色与 RSS 水印保持视觉一致。
- 优化文章页底部相关板块的「换一批」按钮在友链更新 tab 下的行为，改为重新调用导航接口拉取新的随机 5 条订阅，比单纯翻页更符合换一批的语义。

### 修复

- 修复文章页底部「友链更新」tab 一直显示为禁用、有订阅缓存数据时也无法点击进入的问题。原因是 tabs 的启用判断使用了占位空数组的长度，feeds 实际数据走独立变量被忽略；现改为统一通过 `count` 字段判断，feeds 的 count 直接取真实订阅条数。

### 移除

暂无。

## [2.1.0] - 2026-05-03

### 新增

暂无。

### 优化

- 优化前台说说散落布局，未激活的卡片硬限制最高 280px 并裁掉超长内容，无论文字多长、配图多大都不会跨行覆盖下一行卡片；点击卡片激活后解除限制查看完整内容，配合鼠标悬停升顶逻辑保证视觉层次清晰。
- 优化前台说说卡片正文截断显示，配图说说限 2 行、纯文字说说限 6 行，配合外层硬限高让卡片高度真正可控。
- 优化 Coding 页面 GitHub 数据缓存策略，新鲜期从 1 小时调整为 30 分钟，过期后的容忍期从 6 小时延长到 30 天。30 分钟内访问命中内存 / Redis 缓存毫秒返回；过 30 分钟在 30 天内访问立即返回旧数据并后台异步刷新接力，避免冷启动或长间隔访问时同步等待 GitHub 接口造成 4-5 秒卡顿。

### 修复

暂无。

### 移除

暂无。

## [2.0.10] - 2026-05-03

### 新增

- 新增前台说说发布弹窗的推荐标签按最近使用动态聚合，默认展示 8 个，按每个标签最近一次使用时间倒序，不再写死 4 个固定关键词。
- 新增 `GET /api/v1/moments/recent-tags?limit=8` 接口，从已发布的说说聚合最近使用过的 mood 标签。
- 新增前台说说卡片散落布局的鼠标悬停自动升顶逻辑，光标移到哪张卡片，那张就自动浮到最上层，避免相邻卡片视觉遮挡正在阅读的内容。

### 优化

- 优化前台说说卡片单图显示，统一按卡片宽度的 16:9 比例渲染，不再跟随原图高度撑高卡片导致溢出行高、压住下一行卡片；点击图片仍按原始比例弹出大图查看。
- 优化说说发布与编辑流程，提交时新出现的 mood 标签会自动合并进后台 `moment_tags` 选项，管理员后台标签管理器无需手工维护即可看到全部用过的标签。

### 修复

暂无。

### 移除

暂无。

## [2.0.9] - 2026-05-03

### 新增

暂无。

### 优化

- 优化全站中文 UI 文案排版，统一按中文排版规范处理：中文相邻的省略号 `...` 全部改为 `…`、中文后紧跟的半角冒号 `:` 全部改为全角 `：`、中文上下文里的半角括号 `()` 改为全角 `（）`，覆盖 5 套博客主题与管理后台共约 200 处字符串。

### 修复

暂无。

### 移除

暂无。

## [2.0.8] - 2026-05-03

### 新增

暂无。

### 优化

- 优化前台文章、分类、标签、日期和分页等列表型链接的预取策略，减少 Next.js 自动生成的 `_rsc` 预加载请求数量。
- 优化前台首页 Hero 区数据加载，取消打开首页时把所有分类和模式组合一次性预拉的逻辑，改为切换 tab 时按需懒加载并把结果缓存在内存中复用，首屏减少大量 `/posts?per_page=1` 重复请求。
- 优化前台 Azure 主题首页 Hero 自动轮播，循环范围跟随后台配置的 sidebar 分类，不再切到 sidebar 之外的隐藏分类，避免出现"左侧 tab 没有反应但文章在切换"的错觉。
- 优化博客主题（Flux / Utterlog / Renascent / Chred）所有内部链接的预取行为，统一关闭 Next.js 默认 prefetch，避免视口可见或鼠标悬停时大量 `?_rsc` 请求触发。
- 优化前台 Coding 页面 SHIPPING LOG 分段显示，按"最近 3 天 / 本周 / 更早"三段分组，每段单独标题与天数计数，便于快速浏览近期与历史活动。
- 优化前台 Coding 页面所有日期与时间按后台设置的站点时区渲染，避免浏览器本地时区影响分组边界与时间显示。
- 优化公安备案图标改为使用本地静态资源 `/images/beian/ghs.png`，不再每次远程请求 `beian.mps.gov.cn`，加载更快也避免外部依赖。

### 修复

- 修复生产 `docker-compose.prod.yml` 在 `.env` 缺少数据库密码或 JWT 密钥时被 Compose 拒绝启动的问题，改为允许空值并把宿主机 `.env` 挂入容器，使 Web 安装向导写入的配置在重启后可被读取，外部数据库 / 外部 Redis 模式下的安装流程现在能完整跑通。

### 移除

暂无。

## [2.0.7] - 2026-05-02

### 新增

- 新增第三方服务里的高德地图和腾讯位置服务 Key 配置，为后续国内地理编码和说说位置反查提供统一配置入口。
- 新增同源位置反查接口，说说前台定位优先通过后端读取 Mapbox 配置解析城市名，并可使用高德、腾讯位置服务作为后续国内兜底。

### 优化

- 优化 Markdown 编辑器代码相关按钮图标，区分行内代码和代码块语言选择器。
- 优化说说来源显示，网页发布统一显示为 `网页`，兼容旧数据中的 `local`、`web` 和 `browser`。
- 优化关于页面配置弹窗的模板操作按钮间距，避免按钮文字贴近边框。

### 修复

- 修复新建草稿发布为正式文章时可能因 slug 唯一约束冲突导致发布失败的问题。
- 修复草稿从文章列表快捷发布时分类、标签和足迹等关联信息丢失的问题。
- 修复草稿编辑页会把草稿创建时间写入发布时间，导致首次发布不能使用当前发布时间的问题。
- 修复新建文章发布时后台选择的发布时间没有写入数据库的问题。
- 修复发布时间解析没有使用站点时区的问题，`datetime-local` 输入现在按后台时区设置解析。
- 修复旧数据补全 `published_at` 时会错误写入未发布草稿的问题，并自动清理负数草稿 ID 上的发布时间残留。
- 修复公开文章列表、归档、日期页、搜索结果和主题文章卡片仍按草稿创建时间展示或排序的问题，统一优先使用发布时间。
- 修复文章创建和编辑时不能稳定从正文第一个 H1 自动识别标题的问题。
- 修复文章创建、编辑和列表快捷状态切换失败时只显示笼统错误，无法看到后端具体原因的问题。
- 修复前台说说位置反查失败时直接保存经纬度的问题，无法识别城市时改为提示手动填写，不再把坐标写入位置字段。
- 修复关于页面默认模板和自定义 Markdown 模式没有严格互斥的问题，并在保存设置后同步刷新 `/about` 页面缓存。

### 移除

暂无。

## [2.0.6] - 2026-05-01

### 新增

- 新增后台数据库清理按钮，可清理媒体库缺失文件记录、失效相册关联、孤儿文章关联、孤儿评论、足迹残留和过期授权数据。

### 优化

- 优化 Coding 页面 Hero 顶部间距，删除标题上方多余空白。
- 优化 Coding 页面 GitHub 数据缓存，支持 Redis 持久缓存、过期旧数据立即返回和后台刷新，减少打开页面时等待 GitHub API 的情况。
- 优化 Coding 页面前端数据缓存，后台保存设置时会同步刷新 Coding 页面缓存。

### 修复

暂无。

### 移除

暂无。

## [2.0.5] - 2026-05-01

### 新增

暂无。

### 优化

暂无。

### 修复

- 修复后台保存主题菜单或站点设置后 `/api/revalidate` 没有转发到 Next.js，导致前台菜单需要等待 options 缓存过期才生效的问题。

### 移除

暂无。

## [2.0.4] - 2026-05-01

### 新增

- 新增 Coding/GitHub 内置页面，支持从个人资料社交链接自动识别 GitHub 地址，也可在页面管理中单独配置 GitHub 用户名或主页地址。
- 新增 Coding/GitHub 页面 GitHub Token 配置，用于贡献统计 GraphQL 查询和提升 GitHub API 速率。

### 优化

- 优化 Coding/GitHub 页面热力图，改为当前自然年贡献口径；配置 GitHub Token 后优先通过 GraphQL 读取授权可见贡献数据，并补齐全年网格避免格子比例异常。
- 优化 Coding/GitHub 页面最近仓库列表，仓库标题只显示项目名，不再重复显示用户名。
- 优化 Coding/GitHub 页面项目展示方式，后台可从 GitHub 公开仓库中选择要展示的项目，前台按项目展示且每个项目最多显示 5 条最近动作。
- 优化 Coding/GitHub 页面 GitHub 组织账号支持，组织项目改用组织公开仓库接口读取，并按项目拉取最近动作。
- 优化 Coding/GitHub 页面用户来源解析，填写 GitHub 用户地址时会自动合并该用户所属组织的公开仓库，仍不读取私有仓库。
- 优化 Coding/GitHub 页面多 GitHub 地址支持，可同时配置多个用户或组织地址并汇总公开项目。
- 优化 Coding/GitHub 页面标题区，移除 `View on GitHub` 链接，改为直接展示贡献数、仓库数和关注者统计。
- 优化 Coding/GitHub 页面标题栏统计样式，避免统计项换行撑高标题栏，保持与其他页面标题栏高度一致。
- 优化 Coding/GitHub 页面标题内容，标题改为 `@用户名`，副标题显示 GitHub 简介，并将 GitHub 头像移动到热力图右侧。
- 优化 Coding/GitHub 页面标题栏排版，用户名和 GitHub 简介改为同一行显示。
- 优化 Coding/GitHub 页面结构，移除中间重复的 GitHub 资料卡。
- 优化 Coding/GitHub 页面标题栏用户名，改为 GitHub 链接并保持标题原色和无下划线样式，同时使用页面 serif 标题字体。
- 优化 Coding/GitHub 页面 Hero 文案和版式，改为更清晰的 GitHub Journal 标题区与右侧数据摘要。
- 优化 Coding/GitHub 页面贡献统计，标题栏 `total contributions` 改为全部历史贡献数，热力图图例明确显示当前自然年贡献数。
- 优化 Coding/GitHub 页面 Hero 右侧数据摘要，改为显示今天的 GitHub contributions 数值。
- 优化 Coding/GitHub 页面 Hero 文案，改为中英双语标题和说明。
- 优化 Coding/GitHub 页面 section 编号，活动和项目区改为 `§ 01`、`§ 02`。
- 优化 Coding/GitHub 页面项目元信息样式，移除语言、Star 和 Fork 的外边框，改为轻量 inline 信息。
- 优化 Coding/GitHub 页面 Hero 区域，移除 `GitHub Journal` 标签并压缩上下留白。
- 优化 Coding/GitHub 页面活动短标签，明确区分 `PUSH`、`COM`、`CMT` 等事件类型，避免 commit 和 comment 缩写混淆。
- 优化 Coding/GitHub 页面活动短标签样式，不同 GitHub 事件类型使用不同的低饱和标签颜色。
- 优化 Coding/GitHub 页面 Projects 区块，改为按日期聚合的 Shipping Log，按天展示涉及仓库和动作数量，并适配移动端单列阅读。
- 优化 Coding/GitHub 页面 Shipping Log 卡片，移除与 `ACROSS / REPOS` 和徽章重复的中文文字总结。
- 优化 Coding/GitHub 页面配置提示，明确组织仓库需要填写组织地址或仓库 URL，项目列表固定只读取公开仓库。
- 优化后台文章管理导航结构，分类和标签从左侧子菜单移入文章模块顶部 tabs，左侧只保留文章一级入口。
- 优化项目 README 文案，改为更偏产品介绍和使用场景的表达，减少过多技术细节。
- 统一后台设置页与 AI 设置页的 tabs、section、卡片和表单行风格，沉淀为同一套 settings 设计组件与样式 token。

### 修复

- 修复 Coding/GitHub 页面配置中填写 GitHub 仓库 URL 时只截取 owner，导致组织仓库筛选混乱的问题；仓库 URL 现在会自动解析为 owner 来源和项目筛选。
- 修复关于页面编辑器在站点记录条目过多时弹窗内容不能滚动，导致上方配置区域被挤出视窗的问题。

### 移除

暂无。

## [2.0.3] - 2026-05-01

### 新增

- 新增 Renascent 主题，基于学术极简风格提供 serif 标题、黑白灰排版和克制蓝色强调。
- 新增文章内嵌说说短代码 `[moment id="123"][/moment]`，文章编辑器插入说说时改为引用原始说说 ID，并在前台使用独立卡片样式渲染。
- 新增 Markdown GitHub 仓库链接自动卡片化，正文中单独一行 `https://github.com/owner/repo` 会展示项目名称、描述、语言、版本号、Star、Fork 和作者头像。
- 新增 Markdown X/Twitter 帖子自动嵌入，正文中单独一行 X 或 Twitter 状态链接会使用官方 widgets 渲染帖子。

### 优化

- Renascent 主题改为独立组件和独立样式结构，按学术极简设计系统重写首页、文章页、页头、页脚和文章卡片，不再复用 Azure 的页面结构。
- Renascent 首页进一步对齐 `lixiaolai.com` 的 Reborn 风格，改为文字驱动的 Hero、编号指标列表、CURRENTLY 信息条和文章目录式列表。
- Renascent 文章页深度重构为出版式阅读版式，新增文章编号区、元信息侧栏、正文主栏、目录栏、封面题注、AI 摘要、上下篇、相关文章和评论区的统一视觉层级。
- 主题菜单和资料卡设置文案改为通用描述，适配多套具备侧栏功能的主题。
- 后台仪表盘最近文章 / 最新评论改为左右逐行严格对齐，并把 30 天访问趋势的日期标签改为月份加粗 + 日期两行、跨月才显示月份的紧凑布局。
- 优化文章页边读边聊入口的显示时机，默认隐藏，阅读进度超过 40% 后再显示。
- 优化 GitHub 仓库卡片的数据加载时机，改为页面加载完成后异步拉取仓库信息，并增加 5 秒兜底和加载状态。
- 优化 GitHub 仓库卡片右侧视觉区，移除重复内容的 OpenGraph 预览图，改为 GitHub 用户头像和按语言占比渲染的全宽色条。
- 优化 GitHub 仓库卡片元信息展示，新增 latest release 或最新 tag 版本号。
- 优化 X/Twitter 帖子嵌入样式，恢复官方原始 widgets 渲染，不再对 iframe 做高度裁切和缩放。
- 优化统计页面最近访客卡片的分页体验，翻页时保留表格和页面位置，只替换访客列表内容。
- 优化 GitHub 仓库卡片为固定高度，描述改为单行省略，右侧视觉区改为轻量头像展示。
- 优化 GitHub 仓库卡片头像定位，避免主题正文图片样式干扰，头像始终显示在右侧区域正中心。
- 优化 GitHub 仓库卡片悬浮状态，保留边框和阴影反馈，不再产生位移。

### 修复

- 修复后台仪表盘最新评论卡片不显示评论者昵称的问题（JSON 字段 `author` 被错误读为 `author.name`）。
- 修复 Azure 主题评论提交或回复后整块评论区进入加载状态，导致页面出现重载感的问题。
- 修复本地单端口开发时 Next.js HMR WebSocket 被开发源校验和 Go 反代升级处理阻断，导致控制台持续出现 `/_next/webpack-hmr` 连接失败的问题。
- 修复 Renascent 切换后仍输出大量 Azure 组件结构和样式类名的问题。
- 修复后台评论管理、文章预览、仪表盘最近文章和最新评论中的文章链接仍写死 `/posts/slug` 或跳转编辑页的问题，统一跟随站点固定连接打开真实文章页，并在基础设置保存后刷新后台站点链接缓存。
- 修复 GitHub 仓库卡片被主题文章链接样式覆盖，导致卡片标题、描述和元信息出现下划线的问题。
- 修复 GitHub 仓库卡片右侧视觉区被内容高度拉伸导致布局异常的问题。

### 移除

暂无。

## [2.0.2] - 2026-04-29

### 新增

- 关于页面新增结构化个人主页模板，支持个人资料、MBTI、兴趣爱好、音乐偏好和站点更新记录。
- 关于页面支持在默认模板与自定义 Markdown 正文之间切换，Markdown 内容单独保存。

### 优化

- 友情链接分类管理支持上移/下移调整分类顺序，前台友链页按后台分类顺序展示。
- 后台系统页面的关于页编辑改为填表式配置，并继续兼容旧版自定义 HTML 内容。
- 页面管理中内置关于页的操作按钮明确指向关于页面配置编辑器。

### 修复

- 修复 WordPress 同步分类和标签时按大小写敏感 slug 查重，导致 `Debian` / `debian` 等同名标签重复生成 meta 的问题，并在再次同步时合并已产生的来源重复项。
- 修复主题自定义头部按钮和页脚图标时，Azure 固定随机访问按钮与固定 RSS 按钮可能被覆盖或挤出的问题。

### 移除

暂无。

## [2.0.1] - 2026-04-29

### 新增

- 新增 `content/` 运行时内容目录，后台上传主题统一保存到 `content/themes/`，插件统一保存到 `content/plugins/`。

### 优化

- 优化最近访客统计口径，同一访客会话只显示入站页面，并将会话内后续页面停留时间合并为总时长。
- 优化相册管理页「新建相册」和空状态「创建第一个相册」按钮宽度与水平留白。
- 优化 Utterlog 网络状态卡片的手动推送按钮宽度和水平留白，避免长文字贴近按钮边缘。
- 安全设置防御配置重构为统一表单行样式，访问控制、CC 防御和 GeoIP 封锁统一由底部「保存设置」提交，并补充个人博客使用提示。
- 安全设置的防御设置保存按钮文案统一为「保存设置」。
- 主题和插件管理改为优先读取 `content/` 目录，同时兼容旧版根目录 `themes/`、`plugins/`，避免升级后隐藏已有扩展。
- `/themes/*` 资源路由改为先读取用户上传主题资源，再回退到内置主题资源，内置主题源码继续保留在 `web/themes/` 参与前端构建。
- Docker 开发与生产编排新增 `content` 持久化挂载，系统备份与恢复同步覆盖 `content/` 运行时扩展目录。

### 修复

- 修复统计页面选择「全部」时间范围时国家/地区和来源聚合 SQL 条件拼接错误，导致已有国家数据也显示为空的问题。
- 修复数据统计访客地图在低缩放级别关闭世界复制时横向边界被夹住，导致只能上下拖动不能左右拖动的问题。
- 修复前台访问统计组件在部分运行时拿不到 zustand persist hydration API 时导致页面崩溃的问题。
- 修复 API 生产 Docker 镜像构建时因 `api/public/` 目录没有跟踪文件导致 CI 无法复制 public 目录的问题。
- 修复 `/themes/*` 的 `HEAD` 请求可能落到 Next.js 回退路由并返回异常的问题。
- 修复主题静态资源路由可能暴露点文件的问题。

### 移除

- 移除安全设置中的 IP 信誉功能，后台不再显示 IP 信誉 tab，后端不再记录本地风险评分或按评分自动封禁。
- 移除 API 侧重复的内置主题截图文件，内置主题静态资源统一由 web 侧构建产物提供。

## [2.0.0] - 2026-04-29

### 新增

- 后台安全设置新增 GeoIP 数据源选择，可在默认 `api.ipx.ee` 与 `cnip.io` 之间切换。
- 友情链接分类新增持久化配置，每个分类可单独选择卡片式或图标式显示。
- 友情链接新增图标式展示样式，分类可按需切换为紧凑的一行多列布局。

### 优化

- Azure 主题文章页 banner 恢复为与首页文章卡片一致的宽屏显示比例，避免 16:9 在文章页占用过高。
- Azure 主题侧边栏资料卡改为贴边满宽直角样式，并接管原首页顶部社交 icon 到卡片右下角显示。
- Azure 主题侧边栏排序调整，资料卡下方优先显示最新评论，文章、说说和友链统计卡片下移。
- 访客统计、评论归属地、GeoIP 封锁、WordPress 导入评论归属地和服务器出口 IP 识别统一使用同一套 GeoIP provider。
- 内置页面标题统一跟随后台页面名称，补齐说说、订阅、友链、相册、音乐等页面的浏览器标题。
- 后台纯图标操作按钮统一为正方形边框样式，图标居中显示。
- 版本线整理为正式发布版：历史版本合并为 `1.0.0`，当前版本作为 `2.0.0` 正式发布。

### 修复

- 修复友情链接新增空分类刷新后丢失的问题，并允许默认分类修改显示名称。
- 修复友情链接没有链接的分类仍在前台显示的问题。

### 移除

暂无。

## [1.0.0] - 2026-04-29

旧版本详细更新说明已归档到 [RELEASE_HISTORY.md](./RELEASE_HISTORY.md)，用于保留 `1.0.x` 到 `1.5.x` 整理前的历史记录。

### 新增

- 初始发布 Utterlog，提供博客发布、后台管理、前台展示和 Docker 部署基础。
- 新增后台、前台、主题系统、安装、登录、文章、页面、分类、标签、评论、媒体、备份和工具等核心基础能力。
- 新增 Utterlog、Azure、Chred、Flux 内置主题和主题系统基础能力。
- 新增找回密码、SEO、robots.txt、llms.txt、站点标题显示方式和固定链接设置。
- 新增 AI provider、AI 内容摘要、关键词、Slug、排版、封面图、智能评论审核和智能回复能力。
- 新增文章页 AI 陪读卡片、全站浮动 AI 聊天气泡和通用 AI 对话接口。
- 新增系统语言基础设施，后台可选择站点语言，语言包独立为标准翻译文件，内置简体中文、英语和俄语。
- 新增站点时区设置，前后台时间显示按站点时区统一。
- 新增「足迹」功能，支持文章加入足迹页、后台足迹管理、Mapbox token 配置、地理编码、地图和时间线展示。
- 新增文章公开编号规则，草稿使用临时编号，发布后按成功发布文章顺序分配公开编号。

### 优化

- 建立前后端分离架构、主题目录结构、插件目录结构和基础配置体系。
- 优化安装、登录、文章、页面、分类、标签、评论、媒体和主题管理等基础后台流程。
- 优化首页 Hero、文章页随机封面、站点标题字体、Logo/Favicon 上传预览和常规设置结构。
- 主题视觉组件独立化，Utterlog、Azure、Chred、Flux 可分别调整评论、内容、导航、文章信息和 AI 陪读等 UI。
- Azure 主题移动端、Header、搜索、全局 loading、灯箱、hero loading、Logo 悬浮、菜单悬浮和页脚评论表单重新适配。
- 后台主题菜单管理重构，主题可声明菜单位置，Azure Hero 固定分类 tab 保持写死样式。
- 统一文章字数统计，文章页、首页汇总和归档页使用同一套字数口径。
- 优化 AI 相关后台交互、图片生成流程、默认提示词和模型按用途分发。
- 优化文章页相关文章、分类文章、全文搜索 fallback、Markdown 下载卡片和相关文章 pageSize 配置。
- 支持 `site_url` 变更后迁移 cover/media URL，减少附件、品牌资源、RSS/feed 和固定链接中的跨环境写死地址。
- 邮件链接关闭 SES click tracking，管理员回复评论只通知被回复评论者。
- 文章访问统计按后台固定链接规则反向解析路径，支持多种 permalink 模板。
- 文章浏览量改为每次访问或刷新都计数，文章页和首页列表展示数据库真实阅读数。
- 后台按钮图标与文字间距、表单行、AI 设置和常规设置样式统一。
- Web 端 Next.js patch 升级到 `16.2.4`。

### 修复

- 修复早期部署、后台管理、主题切换、封面图展示、站点 URL 迁移和设置保存相关问题。
- 修复生产环境主题样式丢失导致页面样式全失效和大图覆盖文章页的问题。
- 修复生产 Docker 构建复制开发 symlink 后生成断链，导致 uploads 目录创建异常的问题。
- 修复 feeds 订阅页卡片展开时顶动布局、登录密码错误提示被 token 刷新重试冲掉、favicon 和 logo 升级后丢失等问题。
- 修复 AI 提取关键词或摘要时因旧提示词缺少占位符而失败的问题。
- 修复 dashboard 访问统计被 SSR 和前端 `/track` 双计，以及历史访问统计清理无法精准清理重复浏览器访问记录的问题。
- 修复相关文章列表在标签命中较多时丢内容、相关文章与分类文章来源混淆的问题。
- 修复文章页友链更新日期显示为 1970-01-01、PostNavigation 渲染期间触发 setState 的问题。
- 修复评论默认排序不响应后台设置、评论管理员身份显示、管理员回复邮件额外发送给管理员、AI 评论审核/回复未生效等问题。
- 修复 Utterlog 主题相关文章样式、分类 icon、文章页 TOC 和边界文章封面显示异常。
- 修复深色 Logo key 读取错误、Utterlog 和 Flux 主题不渲染上传 Logo 的问题。
- 修复固定链接变更后 RSS feed 仍输出旧默认地址的问题。
- 修复自定义固定链接下文章浏览量一直不增加的问题。
- 修复后台 Logo 与 Favicon 上传后预览框空白的问题。
- 修复友情链接新增时 ID 总是 `1`、排序不连续和默认编号异常的问题。
- 修复草稿占用公开文章编号、新发布文章编号不连续的问题。
- 修复新部署站点残留默认站点信息、关键词文章计数异常等问题。
- 修复站点域名或 `site_url` 变更后部分附件与品牌资源写死绝对地址导致迁移失效的问题。
- 修复后台首页访问按钮在本地端口测试时使用写死站点地址的问题。
- 修复默认 CC 频率限制误启用的问题，新安装默认关闭。
- 修复连续图片自动网格预处理吞掉图片组后的空行，导致紧跟的 Markdown `> ` 引用块被当作普通 `&gt;` 文本输出的问题。
- 修复后台通知铃铛待审核评论入口仍跳转旧 `/dashboard/comments/pending` 的问题，并统一后台相关回跳到 `/admin` 路径。

### 移除

暂无。

[Unreleased]: https://github.com/utterlog/utterlog/compare/v2.0.7...HEAD
[2.0.7]: https://github.com/utterlog/utterlog/releases/tag/v2.0.7
[2.0.6]: https://github.com/utterlog/utterlog/releases/tag/v2.0.6
[2.0.5]: https://github.com/utterlog/utterlog/releases/tag/v2.0.5
[2.0.4]: https://github.com/utterlog/utterlog/releases/tag/v2.0.4
[2.0.3]: https://github.com/utterlog/utterlog/releases/tag/v2.0.3
[2.0.2]: https://github.com/utterlog/utterlog/releases/tag/v2.0.2
[2.0.1]: https://github.com/utterlog/utterlog/releases/tag/v2.0.1
[2.0.0]: https://github.com/utterlog/utterlog/releases/tag/v2.0.0
[1.0.0]: https://github.com/utterlog/utterlog/releases/tag/v1.0.0
