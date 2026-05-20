# 历史更新归档

本文件保留 Utterlog 在正式整理为 `1.0.0` / `2.0.0` 版本线之前的详细更新记录。

从 `2.0.0` 开始，公开 release 只保留正式版本；旧的 `1.0.x` 到 `1.5.x` 详细说明统一归档在这里，避免历史内容因旧 GitHub release/tag 清理而丢失。

归档来源：

- `v1.5.7`、`v1.5.6` 来自仓库整理前的 `CHANGELOG.md`。
- `v1.5.5` 及更早版本来自 `https://utterlog.io/changelog/` 当时展示的最近 30 条更新。

## [1.5.7] - 2026-04-29

### 新增

- 暂无。

### 改进

- Azure 主题 Header 随机文章按钮改为骰子图标，点击后先显示圆形 loading，等待 1 秒再跳转随机文章。
- Azure 主题文章页顶部 banner 改为 16:9 显示比例，减少 16:9 封面图上下裁切。
- Azure 主题移动端页脚和评论表单重新适配，避免横向撑宽和底部滚动异常。
- Azure 主题侧边栏资料卡重构，支持主题设置自定义头像、心情、欢迎语、简介和社交按钮，并读取评论表单缓存显示欢迎回来。

### 修复

- 修复后台通知铃铛待审核评论入口仍跳转旧 `/dashboard/comments/pending` 的问题，并统一后台相关回跳到 `/admin` 路径。
- 修复连续图片自动网格预处理吞掉图片组后的空行，导致紧跟的 Markdown `> ` 引用块被当作普通 `&gt;` 文本输出的问题。

---

## [1.5.6] - 2026-04-28

### 新增

- 新增「足迹」功能：文章可加入足迹页，后台提供足迹管理、地点配置、Mapbox token 设置和地理编码，前台提供地图与时间线展示。
- 新增系统语言基础设施：后台可选择站点语言，语言包独立到标准翻译文件，内置简体中文、英语、俄语。
- 新增站点时区设置：系统时间显示按后台时区配置统一处理，未设置时自动使用本地时区。

### 改进

- Azure 主题移动端、Header、搜索、全局 loading、灯箱、hero loading、Logo 悬浮和菜单悬浮状态重构。
- 后台主题菜单管理重构，主题可声明菜单位置，Azure Hero 固定分类 tab 保持写死样式。
- 文章编号改为只按发布成功文章计数，草稿使用独立临时编号，发布后再分配公开文章编号。
- 统一文章字数统计，文章页、首页汇总和归档页使用同一套字数口径。
- 评论邮件、评论徽标和 AI 评论审核/回复逻辑调整，管理员回复只通知被回复评论者。

### 修复

- 修复友情链接新增时 ID 总是 `1` 的排序问题。
- 修复固定链接变更后 RSS feed 仍输出旧默认地址的问题。
- 修复站点域名或 `site_url` 变更后部分附件与品牌资源写死绝对地址导致迁移失效的问题。
- 修复关键词页有关键词但文章数为 0、相关文章与分类文章来源混淆的问题。
- 修复后台首页访问按钮在本地端口测试时使用写死站点地址的问题。
- 修复生产 Docker 构建复制开发 symlink 后生成断链，导致 uploads 目录创建异常的问题。
- 修复默认 CC 频率限制误启用的问题，新安装默认关闭。

---

## [1.5.5] - 2026-04-27

### 新增

- 增加后台语言切换与标准化语言包加载，内置中文、英文、俄文语言包。
- 增加站点时区设置，前后台时间显示按站点时区统一。
- 增强 Azure 主题菜单、移动端、文章页 TOC 和页面标题样式。

### 改进

- 完善后台 AI 设置、站点设置、安全、工具、媒体、评论等页面的多语言文案。
- 统一文章字数统计、站点总字数统计和归档统计口径。
- 优化附件 URL、RSS/feed 固定链接、站点 URL 切换相关逻辑。
- 优化友情链接排序和默认编号逻辑。

### 修复

- 修复草稿占用公开文章编号、新发布文章编号不连续的问题。
- 修复新部署站点残留默认站点信息、关键词文章计数异常等问题。
- 修复管理员回复邮件额外发送给管理员的问题。
- 修复评论管理员身份显示、CC 防御默认启用、Docker/系统更新相关细节。


---

## [1.5.4] - 2026-04-27

新增

- 添加标准化语言包系统，内置 zh-CN / en-US / ru-RU，并在后台设置中提供站点语言选项。
- 添加统一字数统计逻辑，每篇文章、首页统计和归档统计使用同一套计数。
- Azure 页面标题增加左侧 h2 风格竖线，标题 icon 增加悬浮放大效果。

修复

- 修复友链新建时排序 ID 默认变成 1 的问题。
- 修复管理员回复评论邮件重复发送给管理员的问题，现在只通知评论者。
- 修复标签/关键词有显示但文章数量为 0 时的前后台数据差异。
- 修复上传附件在站点换域名时容易残留绝对 URL 的问题。

改进

- 优化 Azure 移动端菜单、文章页 TOC 按钮和侧栏分类显示。
- CC 防御默认关闭，避免新站部署后误启用频率限制。
- 版本号更新到 v1.5.4，Docker 镜像随 tag 发布。


---

## [1.5.3] - 2026-04-27

### 新增

- Azure 移动端布局重构：顶部分类入口、文章页移动端目录按钮、首页 hero/文章卡片/文章页响应式样式统一迁入主题 CSS。
- 主题菜单位支持主题声明多个位置，Azure sidebar 菜单项可显示分类名称、数量和 icon。

### 修复

- RSS feed 链接跟随自定义固定链接结构，避免继续输出旧的默认 `/posts/{slug}`。
- 友情链接新增时的排序编号按现有数量递增，避免新链接排序值总是 1。
- 发布文章 ID 与公开编号对齐：草稿使用临时编号，正式发布后分配连续文章 ID，草稿不再占用公开编号。

### 改进

- WXR / WordPress 同步导入走统一文章创建与发布编号逻辑。
- 后台文章列表、编辑跳转和菜单分类选择适配新的公开编号和主题菜单数据。


---

## [1.5.2] - 2026-04-26

### 主要变更

文章浏览量计数语义从「同访客同篇文章当日唯一」改为「每次访问 / 刷新都 +1」，按用户明确要求**不做任何限制**。

#### 背景

v1.5.1 修了「文章页 cosmetic +1 跟首页 raw DB 不一致」的问题，做法是把 cosmetic +1 拿掉跟首页对齐。但语义上「我同一篇文章今天打开两次，明明又看了一次，为什么 view_count 不变」感觉不对。

#### 修改

**后端** —— `/track` handler 移除 `isFirstPostViewToday(visitor+ip 当日去重)` 守门，每次命中文章 path 都 `IncrPostViews(postID)`。原 dedup 函数 `isFirstPostViewToday` 已删除（不再有调用方）。爬虫保护仍由 `IsBot` 早退路径承担，bot 流量不会进入增量逻辑。

**前端** —— 4 个主题 `PostPage` 都改为 `(view_count || 0) + 1` cosmetic 显示。dedup 移除后这个 +1 跟 DB 增量永远对齐：

```
SSR 拿到 DB=149 → 页面渲染 150
/track async 跑完 → DB=150
用户回首页刷新 → 看到 150 ✓
再点进文章 SSR 拿到 DB=150 → 页面渲染 151
/track 跑完 → DB=151
首页刷新 → 看到 151 ✓
```

Utterlog 主题原本不带 cosmetic +1，本版统一改为 +1 跟其他 3 主题（Azure / Chred / Flux）行为对齐。

#### 取舍

`view_count` 现在表达「文章被打开过的总次数」，不再有「同访客唯一阅读」的概念。

如果未来需要恢复 unique reader 计数语义，从 git 历史拿回 `isFirstPostViewToday` 函数 + handler 守门即可，前端 cosmetic +1 也要相应改回 raw 显示（参考 v1.5.1 的实现）。


---

## [1.5.1] - 2026-04-26

### Hotfix —— 文章页 view_count 跟首页数字不一致

#### 症状

首页文章卡片显示「149 阅读」→ 点击进入文章页显示「150 阅读」→ 返回首页刷新还是 149。用户以为统计在跳数据。

#### 根因

Azure / Chred / Flux 三个主题的 `PostPage.tsx` 写死了：

{(post.view_count || 0) + 1} 阅读

这是早期想做「乐观更新」当场 +1 让用户感觉「我这次访问算上了」，但这个 +1 是**无条件加的**：

- 同访客同篇文章当天再看一次 → `/track` 被 `isFirstPostViewToday` dedup 拦截 → DB **不再 +1**
- 页面照样显示 +1（cosmetic）
- 首页列表读 DB 真实值 = 149，文章页 cosmetic = 150 → 永远差 1，看着像统计 bug

#### 修复

3 个主题 `PostPage` 都直接渲染 `post.view_count || 0`（DB 真实值），跟首页列表一致。`/track` 真触发增量后，刷新文章或首页都会同步看到新值，行为合并直观。

Utterlog 主题原本就是这么写的，没受影响。

#### 上游影响

视觉上一次访客访问文章不会立即看到 +1，只有当 dedup 判断为「今天第一次看」并且 DB 真的 +1 后，下次刷新才看到新数字。这是诚实的统计行为。


---

## [1.5.0] - 2026-04-26

### 主要内容

#### Added

- **AI 陪读卡片新增「关闭 / 重新打开」**：之前文章页陪读卡片一旦显示就没法关掉。现在跟左侧音乐卡片同款交互：
- 折叠卡片右上角加 X 关闭按钮
- 关掉之后 footer「回到顶部」左边出现「重新打开陪读」按钮（Azure / Chred 主题）
- Utterlog / Flux footer 没有「回到顶部」锚点，重开按钮用 fixed 浮在视口右下角
- 跨组件状态由新 `useReaderChatStore` 维护，进入新文章时一律重置 `dismissed`
- **首页 hero 切换分类增加 loading 过场**：之前点分类 tab，hero 大图直接硬切，看着像「啪一下」。现在加一层「先预加载 + 半透蒙层 + 旋转 spinner」的过场，新图加载完成且最少展示 700ms 才切，配合现有的 `[data-blog-image][data-loaded]` 淡入动画
- **新增「全站浮动聊天气泡」AIChatBubble**：跟「AI 陪读」拆成 2 个独立功能 ——
- **聊天气泡**：仅非文章页显示，对话上下文是「博主助手」（注入 `ai_blogger_*`）
- **陪读**：仅文章页显示，对话上下文是当前文章
- **后端 `/ai/reader-chat` 支持 `post_id=0` 通用模式**：post_id>0 走文章陪读；post_id==0 走「博主助手」system prompt + 跳过文章 context 查询
- **AIChatBubble + AIReaderChat 动态 footer 避让**：滚动监听 + 同时挂 `window` 和 `.blog-main`（Azure / Chred / Utterlog 三主题的 Layout 把内层容器设成 `overflowY: auto`，window scroll 不触发）
- **AIChatBubble + AIReaderChat 浮窗动画跟左侧音乐卡片对齐**：`transition: 'bottom 0.25s ease'`，footer 进入视口时浮窗平滑上推

#### Changed

- **Azure 主题 hero 下方那行播放控制按钮 → 博主社交链接图标**：原本是 5 个 hero 轮播按钮，使用率很低，改为社交链接图标横排（GitHub / Twitter / Weibo / Telegram / YouTube / Instagram / Bilibili / 邮箱 / 网站）
- **Azure 侧栏头像下面的社交链接删除**：避免和 hero 下方那行重复展示
- **8 个 AI 默认提示词全面重写**，针对每个 prompt 模型最常见的失败模式做防御性优化（摘要 / Slug / 关键词 / 润色 / 推荐问题 / 封面图 / 评论审核 / 评论回复）
- **AI 设置「自定义提示词」改为博主资料同款 FormRowTextareaC + 等宽字体**
- **表单视觉系统统一**：新增 `FormRowRadioC` 组件，导出 `FORM_LABEL_WIDTH` / `FORM_ROW_BORDER` / `FORM_ROW_MIN_HEIGHT` / `FORM_LABEL_PADDING` / `FORM_VALUE_PADDING` 等 design token
- **`FormSectionC` 长 description 不再挤压标题**：标题 + 描述分两行布局
- **后台所有「保存」按钮去掉 `fa-floppy-disk` 图标**：保留纯文字「保存」更简洁。覆盖 12 个文件 18 处。上传 / AI 类按钮的 icon 保留
- **封面图默认提示词改为纯中文**：之前是中英双语 negative prompt，现在统一中文
- **Azure 主题首页相关文章卡片网格无间隙紧贴**：`gap: 12px` → `gap: 0`

#### Fixed

- **dashboard 访问统计被双计 + 看起来像爬虫泛滥**：
- 根因：`AccessLogger` middleware 在 SSR 命中 HTML 页时同步写一条 `ul_access_logs`（visitor_id 空 → 退化到 IP 做 dedup key），`PageViewTracker` 在浏览器渲染后又 POST `/api/v1/track` 再写一条（visitor_id 是浏览器签发的真值）—— 两条 dedup key 不同互不拦截，**同一访客被记两次**
- 修复：让 `AccessLogger` middleware **不再写** access_log，让 `/track` 成为唯一访客记录入口。爬虫绝大多数不执行 JS 自然不会触发 PageViewTracker → 不写 access_log → 统计自动接近真实访客数
- 历史数据清理：admin「数据统计 → 数据清理」按钮的 `duplicates` pass 增加 SSR 双计精准清理，一次点击清理两类重复
- 新增 `/admin/analytics/cleanup-bots/preview` 和 `/admin/analytics/cleanup-bots` 独立 endpoint


---

## [1.4.2] - 2026-04-26

### 🚨 Hotfix —— 文章浏览量在自定义固定链接下永不累加

#### 症状

如果 admin 在「常规设置 → 固定链接」选了非默认模板（比如 `/archives/%post_id%`、`/%year%/%month%/%postname%`、`/%category%/%postname%` 等），文章详情页的 `view_count`（页面阅读量）一直显示同一个数字，访客访问时不会 +1。

#### 根因

`analytics.go` 的 `/track` handler 之前硬编码：

if strings.HasPrefix(req.Path, "/posts/") {
  // 只有 URL 以 /posts/ 开头才走 view_count +1
}

URL 形如 `/archives/19`、`/2026/04/my-article` 都不以 `/posts/` 开头 → 永不进 if 分支 → view_count 永远 +0。

#### 修复

新增 `parsePostFromPath(path)` 按 admin 配的 `permalink_structure` option 编译模板正则反向解析 path，提取 `post_id` 或 `slug` 后查 DB。`regexp` 用 `sync.Map` 缓存 per-template 结果，每次 `/track` 请求不重复编译。

模板支持的全部占位符（跟前端 `web/lib/permalink.ts` 1:1 对齐）：

- `%postname%` — slug
- `%post_id%` — 数字 id
- `%year%` / `%month%` / `%day%`
- `%category%` — 首个分类 slug

#### 实测覆盖（6 种模板）

| permalink 模板 | 测试 path | view_count 累加 |

|---|---|---|

| `/posts/%postname%`（默认） | `/posts/` | ✅ +1 |

| `/archives/%post_id%` | `/archives/19` | ✅ +1 |

| `/%year%/%month%/%postname%` | `/2026/04/` | ✅ +1 |

| `/%year%/%month%/%day%/%postname%` | `/2026/04/19/` | ✅ +1 |

| `/%category%/%postname%` | `//` | ✅ +1 |

| `/%postname%`（plain） | `/` | ✅ +1 |

dedup 仍正常工作：同 visitor 同天访问同篇文章最多 +1。

#### 历史数据

**不回填** —— 数字从升级到 v1.4.2 那一刻起开始正常累计，历史丢失的浏览量不动。如果你想从 `ul_access_logs` 反查重建历史，告诉我可以单独写 SQL migration。

### 顺手携带

- 后台「常规设置 → Logo & Favicon」上传后预览空白：抽出 `BrandingPreview` 子组件用 `useState(error)` 跟踪加载状态，失败时降级到 `fa-image-slash` + 「加载失败」文字，不再让用户看到空白预览以为没存上。`key={val}` 让路径变化时重新挂载，修正 url 后立即重试


---

## [1.4.1] - 2026-04-26

### 🚨 紧急 Hotfix —— 生产环境样式全丢

v1.4.0 把 `public/themes//styles.css` 改成符号链接指向 source 文件，dev 模式（bind mount）正常但**生产 Docker 镜像 runner stage 只 COPY `/app/public`**，符号链接的 target `/app/themes/...` 不在生产镜像里 → 浏览器请求 `/themes//styles.css` 返回 404 → CSS 全丢 → 图片没 `max-width` 约束把整页覆盖。

**症状**：升级到 v1.4.0 后，文章页 / 列表页样式全丢，被一张大图占满屏幕。

**修复**：

- `public/themes//styles.css` 恢复为真实文件（不再是符号链接）
- 新增 `npm run sync:themes` 脚本 + `predev` / `prebuild` 自动同步 source → public 钩子，开发者改 source 后启动 dev / build 时自动同步
- `Dockerfile.prod` 加防御性步骤，万一未来又有人加符号链接也会在 build 时自动解引用
- 撤销 v1.3.x 引入的 dev cache-buster（不再需要）

**升级 v1.4.0 → v1.4.1 后样式立刻恢复**。

### 其他改进

#### Utterlog 主题

- 文章页底部相关文章从 6 篇/页 → 3 篇/页（一行 3 列布局）
- 全主题视觉圆角统一 4px：
- 7 处直角（评论头像 / 输入框 / textarea）→ 4px
- 大圆角降级（卡片 12/10/8/6 → 4px，徽章 8 → 4px）
- 评论卡片新增圆角（reply 子评论 / 总评论框 / 编辑/取消按钮 / mention card / 排序按钮）
- 保留圆形头像（50%）/ 装饰小圆点（1px）/ blockquote 左侧粗 border 故意直角

#### 后台 UI

- `.btn` 按钮 icon-文字间距全局加大（影响 72+ 处带 icon 的按钮）：
- `.btn-sm`：6px → **8px**
- `.btn`：8px → **10px**
- `.btn-lg`：10px → **12px**
- 修复用户反馈的「+ 添加菜单项 / 📄 从已有页面添加」icon 跟文字贴太近的视觉问题


---

## [1.4.0] - 2026-04-26

### 🤖 AI 智能评论审核 + 智能回复（重磅新功能）

参考 Typecho CommentAI 插件思路移植，复用现有 ai_providers 路由架构，全功能集成到 Utterlog 评论系统。

**AI 审核**：访客评论提交时同步调 AI 判断是否合规，返回结构化结果 `{passed, confidence, reason}`。失败按策略处理：直接拦截 / 转人工审核 / 忽略。

**AI 回复**：审核通过的评论异步生成回复入队列，三种模式：

- **auto** 立即发布
- **audit** 入队列等管理员审核（推荐）
- **suggest** 仅显示建议不发布

**上下文注入**：可勾选把文章标题 / 摘要 / 父评论传给 AI，让回复更贴题。

**透明性**：4 主题 CommentList 在 AI 回复处显示紫色「🤖 AI 辅助」徽标，回复尾部可附加 admin 配置的「🤖 AI 辅助回复」标识文本。

**频率控制**：每小时调用上限 + 自然延迟（让回复不显得机械秒回）。

**触发过滤**：可仅对文章首条评论 AI 回复，自动跳过 trackback / pingback / admin 自评。

**后台管理**：新页面「评论 → AI 队列」4 status tab（待审核/已发布/已拒绝/错误）+ 数量徽章 + 卡片操作（发布 / 编辑后发布 / 重新生成 / 拒绝 / 删除）。

**提示词管理**：「AI 设置 → 自定义提示词」从 6 项扩到 8 项，加 `comment-audit` 审核提示词 + `comment-reply` 回复提示词，中文默认值 ready。

### 🎨 4 主题视觉组件全面独立化（架构升级）

12 个原共享视觉组件复制到每主题目录，主题作者今后改 UI 完全自主、不影响其他主题：

- AISummary / Pagination / TableOfContents / AIReaderChat / PostNavigation
- CommentList / CommentForm / CommentCaptcha
- PostContent / MusicPlayer

共享基础设施（路由 / 图片 / 批注 / 全局）保持单一来源 —— 跨主题逻辑必须一致的部分不主题独立。

### 🖼️ Logo / Favicon 全局生效 + 持久化

- 上传后存根相对路径 `/logo.png` 不再拼 `site_url`，跨环境通用
- DB migration 自动规范化已存的绝对 URL
- 4 主题 Header 全部接入 `site_brand_mode`（文字 / 文字+Logo / Logo），后台改设置全主题响应
- 修复了 Azure / Chred 主题写死的中文站名 fallback

### 📐 Utterlog 主题文章页大改

- meta 行扩充：时间 / 阅读次数 / 字数 / 阅读时长 / 评论数 + 分类移到最右
- 相关文章 5 → 6 篇/页 3×2 网格布局，hover overlay 显示标题 + 浏览/评论数
- 上下篇边界态封面 fallback 到 randomCoverUrl，不再显示灰色
- TOC 抬到 article 卡片外，修复 `overflow:hidden` 把目录裁掉
- 分类 icon（PostCard / PostPage）终于渲染（FontAwesome class 接入）
- 评论排序后台设置真正生效（之前是 placebo）
- 评论分页 placebo 删除（一直没分页代码）

### 🛠️ 其他改进

- Markdown `[download]` shortcode 抽到全局 `.md-download-card` 类，CSS 变量主题可 override
- 主题 styles.css source/public 双副本不同步 → 改 symlink 统一
- 标题显示方式 3 单选（文字 / 文字+Logo / Logo）4 主题接入
- Next.js 16.2.3 → 16.2.4 patch
- PostNavigation 修复 LIMIT 负数 / 友链时间 1970 / setState during render
- 死代码清理：`BlogHeader` / `BlogFooter` / `VisitorAvatars`（225 行）

### 重要

- AI 评论功能默认 **关闭**，需在「评论设置」启用 + 在「AI 设置 → 用途路由」给 `comment-audit` / `comment-reply` purpose 绑 provider 后才工作
- 主题视觉组件独立后，老站点升级不会丢失任何视觉，只是主题作者今后改 UI 路径变了（改 `themes//.tsx` 而不是 `components/blog/.tsx`）


---

## [1.3.2] - 2026-04-26

### 修复

- **文章页"相关文章"列表丢内容**：tags 命中 ≥6 篇时，category / 全文搜索两个 fallback 的 `LIMIT 5-len(related)` 会算成负数，PostgreSQL 直接报错被 sqlx 静默吞掉，相当于 fallback 完全没跑。统一为 `LIMIT 20-len(related)`，保留 20 条总上限的语义
- **文章页"友链更新"全部显示 1970-01-01**：后端 SQL 漏选 `fi.pub_date` 列，结构体里 `db:\"pub_date\"` 取不到值默认 0，前端 `new Date(0 * 1000)` 自然渲染成 1970；补上 SELECT 列即可
- **PostNavigation setState during render 警告**：分页越界自愈逻辑原本写在渲染流里直接 `setPageIndex(0)`，触发 React "Cannot update during render" 警告；改到 `useEffect` 里依赖 `[activeTab, data, pageIndex]`，避免多余的同步 re-render
- 仅影响文章页底部的 prev/next + 相关/随机/热门/分类/友链 tab 区


---

## [1.3.1] - 2026-04-25

### 修复

- **feeds 订阅页卡片展开不再顶动布局**：长文卡片点击展开时，原本会撑高 grid 行把下面整排卡片推下去，现在展开内容脱离正常流以浮层方式盖在下方卡片之上，grid 单元格保持原位
- **登录密码错误提示丢失**：axios 拦截器把 `/auth/login` 的 401 当成 token 过期触发刷新-重试，把 toast 提示带着重定向一起冲掉了；现在 `/auth/login` `/auth/refresh` `/auth/totp/validate` `/auth/passkey/*` 全部跳过刷新逻辑，错误直接抛回 Login.tsx
- **favicon / logo 升级后丢失**：上传文件原本写到容器内 `public/`，docker compose recreate 时被擦除；现在统一写入挂载卷下的 `public/uploads/branding/`，对外路径 `/favicon.ext` `/logo.ext` `/dark-logo.ext` 通过 `servePersistent` 优先走持久化路径
- **AI 提取关键词/摘要回复 "Please provide the article"**：旧版本保存的英文默认提示词没有 `{title}` `{content}` 占位符，新版 renderPrompt 直接发模板没带正文；增加占位符缺失时自动追加 `\n标题/内容` 兜底，并清理 DB 中 3 条已知的过时英文默认提示词

### 改进

- **AI 封面图提示词加固**：模型常把标题里的英文字母/版本号（如 "phpMyAdmin 6"）渲染成画面上的乱码字幕；新默认提示词把"禁止任何文字"指令前置到首行（中英双语），用 `{excerpt_block}` 作为主体描述，`{title}` 降级为尾部话题提示
- **6 项 AI 提示词全部可在后台编辑**：摘要 / Slug / 关键词 / 排版 / 推荐问题 / 封面图；每项中文默认值，textarea 留空 + 保存自动恢复默认；管理员保存等于当前默认时存空字符串，未来升级默认值时自动跟随
- **AI 模型分发改为按用途路由**：把原先 8 个 `ai_purpose_*_provider` 收成 2 个槽位（content + chat），文章/摘要/关键词/排版/推荐问题走 content，前后台陪读走 chat；DB 自动清理 7 条遗留 option

### 重要

- 后台 → AI 设置 → 自定义提示词，6 个 textarea 留空保存即可恢复 v1.3.1 内置中文默认


---

## [1.3.0] - 2026-04-25

### 重磅新增

#### AI 图片生成（三家全部接通）

- **OpenAI Images API** — gpt-image-2（ChatGPT 图像 2.0）/ gpt-image-1 / dall-e-3
- **通义千问图像** — qwen-image-2.0-pro，走 DashScope 的 sync multimodal-generation 端点
- **Google Imagen** — imagen-4.0-generate-preview / imagen-3.0-generate-002

文章编辑器封面 URL 旁边的 ✨ 按钮真实可用：自动按管理后台「特色图设置」的比例 / 风格 / 文字策略合成 prompt，调用默认图片提供商生成，然后转码成 WebP/PNG/JPG（按管理员配置的格式 + 质量）落到存储驱动并入 media 表。

#### AVIF 上传转码（6× 提速）

之前用纯 Go WASM 编码 1080p 图要 1-3 秒。改用 CGO + libaom 后约 **468ms**，5-6 倍提速。运行时镜像加 ~3MB libaom 包。

#### AI 功能模型分配

新增 `AI 设置 → 功能分配` 标签页，支持给 AI 功能单独指定不同提供商：

- **内容生成** — AI 摘要 / Slug / 关键词 / 排版润色 / 批量问答 / SQL 查询
- **聊天** — 后台 AI 助手 + 前台读者陪读 + Telegram /ai 命令

留空走默认链；指定的提供商失败会自动回退默认。

#### 智能服务检测 + 共用宿主服务

`install.sh` 现在会扫描 host 上是否已有 PostgreSQL / Redis（1Panel / 宝塔 等管理面板自带），可选择「复用宿主服务」省去重复部署。pgvector 扩展不存在时自动 `apk add postgresql-pgvector` / `apt install postgresql-XX-pgvector`。

### 默认主题

**重命名 Westlife → Utterlog** 作为官方默认主题（之前的 Utterlog 2026 主题已删除）。数据库幂等迁移，老站升级自动改写 active_theme。

### 修复一大批假设置

之前管理后台里这些选项「看着能改、其实不生效」，全部修真或删除：

- 图片处理 → 占位效果（5 选项假）→ **删除**
- 图片处理 → 灯箱风格（4 选项假）→ **删除**
- 图片处理 → 启用懒加载 toggle 假 → **修真**
- 图片处理 → 启用灯箱 toggle 假 → **修真**
- 图片处理 → 动画时长（fade/pixel 假，scale 真）→ **全部修真**
- 图片处理 → 转换格式 不生效 → **修真，新增 AVIF**
- 图片处理 → 压缩质量 不生效 → **修真**
- 图片处理 → 去除 EXIF（实际行为 ≠ label）→ **修真 + 改 hint**
- 图片处理 → TinyPNG（API Key 假）→ **删除**
- 常规设置 → favicon 上传只支持 PNG，其他扩展 404 → **修真**
- 存储设置 → 本地存储用量条（之前是「占管理员设的虚拟 GB 限额」）→ 改成 statfs 真实磁盘空间
- AI 设置 → 特色图设置 → 预期模型族（虚标签）→ **删除**
- AI 设置 → 聊天配置 → 允许访客（后端不读）→ **修真**
- AI 设置 → 聊天配置 → 气泡位置（前端不读）→ **修真**
- AI 设置 → 聊天配置 → 对话温度（callOneProvider 写死 0.3 / 0.7）→ **修真**

### 数据库依赖升级

- Redis 7-alpine → **8-alpine**（向后兼容 RDB/AOF，无须迁移数据）
- PostgreSQL 保持 pgvector pg18（已经是 PG 18 最新）

### 主题 / 渲染修复

- `` 由 root layout 服务端直接渲染，删掉 `(blog)/layout` 里触发 Next.js 16 React 警告的 inline ``
- 后台色板与博客主题分用 `data-color` / `data-theme` 两个属性，不再互相覆盖
- Utterlog 主题 PostCard / PostPage 时区固定 Asia/Shanghai，修复跨日 hydration 警告
- Chred 主题相关文章卡片图片铺满整个 viewport 的 bug
- AI 提供商列表卡片间距、操作按钮风格、模态间距统一

### 模型预设更新

- OpenAI: + gpt-5.5, gpt-5
- DeepSeek: + deepseek-v4, deepseek-v3
- Kimi: + kimi-k2.6
- **新增 Anthropic Claude 预设**（claude-opus-4-7 / claude-sonnet-4-7）
- 删掉假的 deepseek-embedding 预设（DeepSeek 没有 embedding API）

### 升级须知

- `image_lazy_load_placeholder` / `image_lightbox_style` / `tinypng_*` / `ai_image_model` / 7 个旧的 `ai_purpose_*_provider` —— 启动时自动幂等清理，不需要手动处理
- AI 图片生成需要在管理后台 `AI 设置 → 提供商` 里**新增一个 type=图片**的提供商并启用（OpenAI 图像 / 通义千问图像 / Google Imagen 三个预设可一键填好）
- OpenAI gpt-image-2 需要组织通过 ID 验证；用不了的话改 `dall-e-3` 或换通义万相


---

## [1.2.9] - 2026-04-25

### 主题

- 重命名 **Westlife → Utterlog**，作为官方默认主题
- 删除 \`Utterlog 2026\` 主题
- 后台主题列表现在以 Utterlog 为首位
- 数据库幂等迁移：\`active_theme IN ('Westlife', '2026')\` 自动改写为 \`Utterlog\`，老站升级无需手动操作

### 修复

- **整套主题作用域 CSS 现在真的生效**

  之前 \`themes/{name}/styles.css\` 全部用 \`[data-theme="..."]\` 选择器作用域，但只有 Flux 通过客户端 useEffect 自己盖章。Azure / Chred 的所有规则其实都没生效，最直观的症状是 Chred 文章页里相关文章卡片图片**铺满整个屏幕**（\`.post-related-card-cover\` 拿不到 \`position: relative; aspect-ratio: 16/10\`，子元素的 \`position: absolute; inset: 0\` 一路冒泡到 viewport）。

  现在由 \`(blog)/layout.tsx\` 在 SSR 阶段注入 inline \`\` 同步给 \`\` 写 \`data-theme\`，对所有主题一次性生效。

- **后台色板 localStorage 不再覆盖博客主题**

  \`providers.tsx\` + \`store.ts\` 改成只在当前 \`data-theme\` 为空或为色板名（steel/blue/...）时才写入；如果已是博客主题名（Utterlog/Azure/Chred/Flux），让位不动。

- Chred 主题：分页导航、blog-prose 标题、引用条、列表项标记、表格表头、相关卡片悬浮、tag # 前缀等多处 hardcoded #0052D9 改为 \`var(--color-primary)\`
- 侧边栏 \"最新评论\" 可点击跳转所评论文章

### 改进

- \`web/lib/theme.ts\` 新增 \`DEFAULT_THEME\` 导出，所有调用方不再 hardcode 主题名


---

## [1.2.8] - 2026-04-25

v1.2.7 之后累积 5 个 fix。

### 文章页随机封面跟首页统一

PostPage 之前调 `randomCoverUrl(post.id)` 不带 options，落到 helper 内置默认模板，文章 banner 跟首页同一篇文章卡片的随机图链接不一致。现在 page caller 服务端 fetch options 并透传给 ThemePostPage，所有位置走同一个 `random_image_api` 配置 + 自动注入 `r={id}`。

### 首页 Hero 三处优化

- **自动切换 8 → 5 秒**，且手动点击任意 tab / 控制按钮立即重置 5 秒计时（之前可能在剩余 0.5 秒触发，瞬间跳走刚选的 tab）
- **去掉 hero 鼠标悬停缩放**：280-450px 的大图 1.04× 缩放看起来抖，PostCard / 文章页 prev-next 缩略图保留不变
- **标题对齐 + 阅读对比度**：标题条高度严格等于左侧分类 tab 单格高度，底部对齐左侧最后一个 tab；纯透明背景，文字双层 text-shadow（外晕 + 紧贴黑描边），白色封面也清晰可读

无 schema 改动；docker 升级 0 配置丢失。


---

## [1.2.7] - 2026-04-25

### 真实可用的找回密码

之前 admin 登录页的「找回密码」按钮是**未实装的 TODO**——`handleForgotSubmit` 只 `setTimeout(800)` 然后 `setForgotSent(true)`，从未调过任何 API。用户看到"请检查收件箱"但邮件根本没发。

现在打通整条链路。

#### 后端

| 路由 | 行为 |

|---|---|

| `POST /api/v1/auth/forgot-password` `{email}` | crypto/rand 生成 32 字节 token (64 hex)，存 user 行 60 分钟过期，异步发邮件。响应永远是「如果该邮箱已注册...」（防 email 枚举） |

| `POST /api/v1/auth/reset-password` `{token, new_password}` | token 查用户 + 验过期 → bcrypt cost 10 + UPDATE password + 清空 token（单次使用） |

DB 加两列，仍走 `ALTER TABLE IF NOT EXISTS`（部署到旧库无破坏）：

- `reset_token VARCHAR(64) DEFAULT ''`
- `reset_token_expires_at BIGINT DEFAULT 0`
- 部分索引 `idx_users_reset_token` 仅 index 非空 token

#### 邮件模板

`tpl/password_reset.html` 复用 `_base.html` 框架（品牌头 + 按钮 + 提示），按钮带 `ses:no-track`（v1.2.6 修复的同款属性，避免 AWS SES 包装链接）。

发送链路走的是同一 `util.SendEmail` 通道——这意味着 v1.2.2 的 Sendflare body 字段修复也覆盖到这里。

#### 前端

- Admin Login 的"找回密码"现在调真 API
- 新页面 `/admin/reset-password?token=` 收新密码 → 调 reset → 成功 3s 后跳回 login

#### 验证

本地端到端跑通：

1. POST forgot-password → DB 写入 `75adf058bf9c1dd4...` 64 字符 token，60 分钟过期

2. POST reset-password 用同 token + 新密码 → password hash 更新，token + 过期时间清零

3. 用新密码 login 200 success


---

## [1.2.6] - 2026-04-25

### 常规设置精简

将站点描述 / 站点关键词从「常规设置」tab 移除（v1.2.4 已迁到 SEO tab 的 `seo_default_description` / `seo_default_keywords`）。重复编辑入口造成混淆。layout.tsx 的 metadata fallback 链仍读取旧字段，已有数据不丢失。

### 邮件 anchor 加 `ses:no-track`

Sendflare 的底层 AWS SES Configuration Set 启用了 Click event publishing，所有外发邮件 `` 被 wrap 成 `awstrack.me/L0/...` 重定向链接，导致：

- 右键复制链接 / 邮件 client 预览 URL 看到的是 awstrack 而非 utterlog 自家域名
- 用户测算 Click 事件被 SES 拦截而非站点自己 analytics 接到

AWS SES 支持 `ses:no-track` HTML 属性跳过 click tracking。8 个邮件模板（\_base / new_comment / pending_comment / comment_reply / verify_code / link_request / upgrade / incident）共 18 个 anchor 全部加上此属性。

非 SES 邮件 client 会忽略此 attribute，无副作用。


---

## [1.2.5] - 2026-04-25

### site_url 改动自动迁移 cover/media URL

之前你在后台改 `site_url`（比如 `https://www.xifeng.net` → `https://xifeng.net`），DB 里所有已存的绝对 URL（文章 cover_url、media 表 url）都还指向旧域名，前端刷新后 cover 仍是旧链接，要手动 SQL replace 才能修。

现在 `UpdateOptions` 在保存 site_url 前会捕获旧值，保存后比对 origin（scheme + host + port），如果变了就立即在 DB 跑 prefix replace：

UPDATE ul_posts  SET cover_url = REPLACE(cover_url, $oldOrigin, $newOrigin) WHERE cover_url LIKE $oldOrigin || '/%';
UPDATE ul_media  SET url       = REPLACE(url,       $oldOrigin, $newOrigin) WHERE url       LIKE $oldOrigin || '/%';

#### 安全设计

- **只 prefix 替换**：`LIKE 'oldOrigin/%'` 不动 URL path/query 里偶然出现旧域名的字符串
- **scope 限定**：只覆盖 cover_url + media.url（我们自己存的资产 URL 列）；post.content / 评论 / 其他 option 留给未来的 admin 显式"URL 迁移"工具去清，避免误伤引用文字
- **malformed 输入跳过**：旧/新值任一无法 parse 出 origin 就 abort，typo 不会触发批量修改
- **trailing slash insensitive**：`https://xifeng.net/` 和 `https://xifeng.net` 视同
- **结果记 server log**：迁移行数会打印到 `[site_url-migrate]` log 行


---

## [1.2.4] - 2026-04-25

### SEO 与 AI 设置 tab

后台 → 系统设置 → 新增 「SEO 与 AI」 tab，包含三个区块：

**AI 抓取策略**

- `允许 AI 爬虫读取站点` — 控制 robots.txt 给 GPTBot / ClaudeBot / CCBot / PerplexityBot / Google-Extended / Bytespider / Applebot-Extended 等 16 个 AI 爬虫的 Allow / Disallow，**不影响普通搜索引擎**
- `生成 /llms.txt 站点索引` — 输出 llmstxt.org 提议的 markdown 索引（站点标题 + 简介 + 文章链接列表，最多 200 篇），让 LLM 一次拿到整站结构
- `生成 /llms-full.txt 全文版` — 含每篇文章 markdown 全文（最多 500 篇），适合允许 AI 训练时使用

**默认 SEO 元信息**

- `默认描述` / `默认关键词` / `默认分享图` — 文章未设自定时的兜底；用作 meta description / og:image / twitter:image

**X 卡片**

- `X 用户名` (twitter:site) + `卡片样式` (summary_large_image / summary)

### 三个新公开路由

| 路由 | 行为 |

|---|---|

| `/robots.txt` | 始终允许 `*` 索引；按 ai_crawl_allowed 设 AI bots Allow / Disallow；附 sitemap 链接 |

| `/llms.txt` | markdown 索引，H1 = 站点标题，blockquote = 副标题，## Posts = 文章列表 |

| `/llms-full.txt` | 仅在 llms_full_enabled 开启时返回；包含 post body |

域名以 `site_url` option 为准（`PublicBaseURL()`），不再写死容器内的 `APP_URL`。

### 前端 metadata

`app/layout.tsx generateMetadata` 现在生成完整 OpenGraph + Twitter card：

- `description / keywords` 走 SEO tab 默认值兜底
- `metadataBase` 从 `site_url` 推断，让相对 og:image 正确解析
- `og:image` / `twitter:image` 全覆盖

`posts/[slug]/page.tsx` 添加文章级 override：`type=article`，`images=[post.cover_url]`。

### 顺手修的几个 bug（之前几次会话累积）

- `random_image_enabled` admin form 默认改 `?? true`，避免保存常规设置时静默禁用 cover
- `randomCoverUrl()` 自动给 URL 注入 `r={id}`，每个 post 拿到唯一随机图（即便 admin 填的 URL 没带 r 参数）
- `globals.css` 的 fade 模式 `transition` 加上 `transform 0.6s`，cover hover 不再"卡顿"瞬间跳变
- `PostNavigation` 的 LazyCardImage inline transition 同步加 transform
- 站点标题字体 = 阿里妈妈方圆体（`.site-title` class，4 个主题 Header 全接入）


---

## [1.2.2] - 2026-04-25

### 修复 · 评论通知邮件正文一直为空

`util/email.go` 给 Sendflare 发邮件用的是 `html` 字段，但 Sendflare 实际用的字段名是 **`body`**——其他字段名 (`html`, `htmlBody`, `html_body`, `body_html`, `content`, `message`, `text`) API 都返回 200 SUCCESS 但邮件正文不会出现。所有评论通知/AI 摘要邮件之前都只显示标题、正文空白。一行 fix。

Resend provider 不变（Resend 真用 `html`）。

### 统一 cover 悬浮缩放

主题层之前维护三套并行 hover 触发器：

- `.azure-img-hover-wrap:hover .azure-img-hover` （PostCard）
- `.post-prev-next-link:hover .post-prev-next-cover img` （文章导航）
- 首页 hero 因为没接到任何触发器，鼠标悬停时**完全没动画**

现在：`globals.css` 单一 `.cover-zoom` 规则命中所有 `[data-blog-image]` 后代图，主题只需用 `` 即可。删除 Azure 主题前缀类，加 `prefers-reduced-motion` 支持。

### 清理 console "empty src" warning

随机图禁用 + post 没 cover_url 时 `randomCoverUrl()` 返回空字符串，被传入 `` 触发 Next.js warning + 浪费的 page re-fetch。

- `FadeCover` 在 src 为空时不渲染 ``，只保留 placeholder 占位
- 4 个主题的 `PostCard` 加 `coverUrl && ()` guard
- `PostNavigation` 的 `LazyCardImage` 也加 guard

### PostNavigation 也走 admin 设置

之前 v1.2.1 漏了 `components/blog/PostNavigation.tsx` 的 3 处硬编码 `https://img.et/1920/1080?...`，现已统一调 `randomCoverUrl(id, options)`，admin "图片处理 → 随机图片 API" 设置在 prev/next 缩略图、相关文章卡片中也生效。


---

## [1.2.1] - 2026-04-25

### 修复

后台「系统设置 → 图片处理 → 随机图片 API」选项之前是 UI 装饰，主题里硬编码 `https://img.et/1920/1080?type=landscape&r={id}`，所以无论怎么改都不生效。

现在主题层通过 `lib/blog-image.ts` 暴露的 `randomCoverUrl(postId, options)` helper 读 `random_image_enabled` + `random_image_api`，支持 `{id}` `{w}` `{h}` 占位符。

- `random_image_enabled = false` → 返回空字符串，cover 完全不显示
- `random_image_api` 为空 → fallback 到默认 `img.et` 模板（保持向后兼容）
- 4 个主题（Azure / Flux / Chred / Westlife）的 PostCard + HomePage hero 全部接入

> PostPage（文章页）的 fallback 暂时不读 admin 选项（server component 不持有 ThemeContext），但调用方式已经统一为 `randomCoverUrl()`，未来通过 page → theme 的 `options` prop 一行接入。


---

## [1.2.0] - 2026-04-25

### 资源 CDN 整合

- FontAwesome Pro 7.2.0 + 全部字体迁移到 `static.utterlog.com`（Cloudflare R2，1 年 immutable，`Access-Control-Allow-Origin: *`）
- 新增可选中文字体库：霞鹜文楷 / 文楷 Bright / 文楷屏幕阅读版 / 漫黑 / 思源宋体 / Maple Mono CN / TencentSans W7 / 阿里妈妈方圆体 / 优设标题黑 / 斗鱼追光体 / 快看世界体（cn-font-split 切片，按需加载切片）
- 主中文字体 Noto Sans SC 通过 unicode-range 切片自托管，浏览器只下载实际用到的字符切片

### LCP 图片系统重构

- 主题层不再各自维护 LazyImage / 淡入逻辑，统一由系统提供 `coverProps()`（`web/lib/blog-image.ts`）
- 首页第一张 cover 自动 `fetchpriority="high" loading="eager"`，告别 Lighthouse 报告的"LCP 图被 lazy-load"问题
- 文章正文图也接入 `data-blog-image` 系统，admin "图片显示效果"设置全站统一生效
- 删除冗余的 `components/ui/LazyImage`（与 `blog/LazyImage` 双重淡入打架），代码减少 ~160 行

### FontAwesome `font-display: swap`

- 通过 globals.css 末尾的 `@font-face` 覆盖把 FA 的 6 个使用家族强制 `swap`，消除 Lighthouse 报告的 ~140ms FCP 损失

### 主题适配

- Azure / Flux / Chred / Westlife 全部接入新 cover 系统
- Flux 主题字体源 jsDelivr `cyrilwanner/fonts` 已 404，`--flux-font` 改 Ubuntu，`--flux-mono` 改 Google Sans Code
- 后台代码字体从 PaperMono 升级为 Google Sans Code

### 资源目录页

- 访问 `https://static.utterlog.com/` 可看到所有资源的可复制 link 标签清单


---

## [1.1.5] - 2026-04-24

### 侧边栏头像空白的根因

- [theme-data.ts:5](web/lib/theme-data.ts:5) 的 `API_BASE` 优先级反了：`NEXT_PUBLIC_API_URL || INTERNAL_API_URL`。在 Docker 里 `NEXT_PUBLIC_API_URL=/api/v1`（相对路径，给浏览器用），Node fetch 不接受相对 URL，服务端 `/owner` 请求静默失败，`ownerRes.data` 永远是 `{}`，SSR 出来的侧边栏连 `` 都不输出。
- 改为 `INTERNAL_API_URL || NEXT_PUBLIC_API_URL`，与 [blog-api.ts](web/lib/blog-api.ts) 一致。服务端走 `http://api:8080/api/v1`，浏览器仍用 `/api/v1`。

### 头像渲染方式统一

- `GetSiteOwner.avatar` 回归 `resolveDisplayAvatar(u.Email)`，与 `Login` / `Me` / 评论 / 联邦站点使用的是同一解析函数。站内所有地方（页眉、页脚、侧边栏、评论卡片、AI 阅读助手）都会对同一用户渲染同一 URL。
- Azure / Flux Sidebar 去掉临时兜底链和首字母占位符，保留最简单的 ``。

### 侧边栏仍然显示灰色怎么办

如果 gravatar 对你的邮箱没有真实头像（返回的是 mystery person 剪影），在后台 **Profile → 基本信息 → 头像源** 切换为 **联盟头像 (Utterlog ID)**，即可用 `https://id.utterlog.com/avatar/` 渲染。


---

## [1.1.4] - 2026-04-24

### AI 摘要保存不同步

- **根因**：`model.CreatePost` / `UpdatePost` 的 SQL 语句里**没有 `ai_summary` 列**，handler 层设置的 `p.AISummary` 被静默丢弃；又因为后台 `generateAISummary` 在 `ai_summary` 非空时自动跳过，文章页永远显示旧值。
- **修复**：
- Model 的两条 SQL 加上 `ai_summary` 列。
- Handler 在管理员手动填摘要时把 `excerpt` 镜像写入 `ai_summary`。
- Flux / Chred / Westlife / 2026 主题的 `PostPage` 补上 `aiSummary={post.ai_summary}` prop（Azure 早已正确）。

### 侧边栏灰色头像

- **根因**：`GetSiteOwner` 的 `avatar` 字段直接调 `resolveDisplayAvatar(email)`，该函数**永远返回 gravatar（带 `d=mp` 灰色剪影）或 utterlog URL**，完全忽略 `users.avatar` 里管理员上传的文件。
- **修复**：
- `GetSiteOwner` 返回 `u.Avatar`（数据库真实上传值），由前端 `theme-data.ts` 按 `avatar_source` 设置做优先级选择。
- Azure / Flux Sidebar 去掉不存在的 `siteOptions.site_avatar` 兜底，避免掉到 `?d=mp` 灰色剪影。
- 所有源都为空时渲染首字母占位符，不再输出 ``（Next.js 会报 console warning 并触发整页重新下载）。

### Markdown 编辑器布局

- `minHeight` 只作用于根容器；之前同时下发到 body 和 textarea，叠加 40px 工具栏导致整体超出父容器高度，底部被 `overflow: hidden` 裁剪（textarea 的滚动条和末尾几行不可见）。
- 工具栏改为 `flex-shrink: 0` + `flex-wrap: nowrap` + `overflow-x: auto`，永远一行、窄屏横向滚动；不再把正文挤下去。
- flex 子节点全部加 `min-height: 0`，解除默认 `min-size: auto` 锁，textarea 可正常暴露自身滚动条。

### 文章图片灯箱

- 点击事件改为 capture 阶段 + `preventDefault` / `stopPropagation`，确保 markdown `[![alt](src)](href)` 也走自定义 ViewImage 灯箱，不再跟随 `` 的默认跳转行为。


---

## [1.1.3] - 2026-04-24

### 文章图片体验

- **LazyImage 稳定化**：`ReactMarkdown` 的 `components` 映射不再每次渲染重建，打开/关闭灯箱时文章图片不会再重新淡入。
- **Hero / Banner 专用 FadeCover**：首页和文章页封面使用硬编码的 blur → 清晰淡入，不受后台"图片显示效果"影响。
- **后台图片效果**：精简到 淡入 / 像素化 / 缩放 / 无 四种，作用域仅限文章正文 `data-blog-image`。
- **加载指示器**：spinner 常驻 DOM，通过 CSS opacity 渐隐，与 img 的 blur 过渡时间对齐，避免"加载了两次"的错觉。

### 灯箱重做（ViewImage 风格）

- 直角方形卡片、translateY 滑入/滑出（300ms）。
- 相册模式：收集文章内所有图片，支持 ← / → / Esc 键盘操作。
- 加载进度条、张数计数（n/total）、上一张/下一张按钮。
- 移除 `backdrop-filter` 以消除 GPU 合成抖动。
- 滚动锁通过 `useLayoutEffect` 同步生效，避免打开/关闭时的 1px 水平位移。

### 管理后台

- **AiSettings** 全面对齐 Settings 的 `FormSectionC` / `FormRow*` 单元；Toggle 右侧列收窄到 auto 宽度；左右不再分色。
- **Profile / Settings** 若干细节补齐。

### 其他修复

- **Azure Sidebar** 改走 `useThemeContext()`，社交图标可读取 `social_links` 展开后的 flat keys。
- **页脚备案** 公安链接改为 `beian.mps.gov.cn`（新版门户），顺序 ICP → 公安。
- **Passkey** 起源读取改用 `config.PublicBaseURL()`，修复 WebAuthn origin 校验报错。
- **AI 摘要** 边框圆角 8px → 4px。


---

## [1.1.1] - 2026-04-24

### 修复

**访问统计不再被伪装成 Chrome 的爬虫刷量**

原来的 UA 词典（`IsBot`）只拦截明确带 `bot / curl / ahrefs` 等关键字的 UA，伪装成真浏览器（如 Chrome/macOS）的爬虫直接混进 `access_logs`，导致后台「最近访客」列表出现同一 IP 一分钟内连续访问 10+ 个 tag / archive / date 页的情况。

新增**行为速率 gate**：同一 visitor（按 `visitor_id` 或 IP）60 秒内已记录 ≥ 8 次页面访问，后续请求直接丢弃。真人读者几乎不会一分钟点 8 个不同页面，归档 / 标签云爬虫常年如此。

**Full Changelog**: https://github.com/utterlog/utterlog/compare/v1.1.0...v1.1.1


---

## [1.1.0] - 2026-04-24

### 亮点

#### 固定连接（Permalink）可自定义

Posts 管理页右上角新增 ⚙️ 设置，支持 6 种预设 + 自定义模板：

| 形态 | 例子 |

|---|---|

| `/posts/%postname%`（默认） | `/posts/my-article` |

| `/%postname%` | `/my-article` |

| `/%year%/%month%/%postname%` | `/2026/04/my-article` |

| `/%year%/%month%/%day%/%postname%` | `/2026/04/24/my-article` |

| `/%category%/%postname%` | `/tech/my-article` |

| `/archives/%post_id%` | `/archives/42` |

改完后站内所有链接直接以新格式输出，**不走 301 跳转**。`/posts/:slug` 保留作为老书签兜底。

#### 文章发布时间区分 draft / publish

- `Post.PublishedAt` 独立字段（DB 里本来就有，现在才接通）
- 文章列表「时间」列：草稿显示 `created_at`，其他显示 `published_at`
- 编辑页侧边栏可改发布时间，草稿→发布会自动回填当前时间

#### 订阅页（/feeds）整改

- 换成 `favicon.im?larger=true`（原 `ico.bluecdn.com` 大量 404）
- 修复站点名 HTML 实体乱码（`Kevin's`）
- 修复头像和首字重叠（favicon 透明时首字穿透）
- 卡片不再互相覆盖（取消故意的重叠排版，改 CSS Grid 等宽 + 轻度旋转）

#### 文章正文图片网格自定义排版

| 张数 | 排版 |

|---|---|

| 2 | 一行 ×2 |

| 3 | 一行 ×3（正方形） |

| 4 | 一行 ×4 |

| 5 | 2 + 3 |

| 6 | 3 + 3 |

| 7 | 3 + 4 |

| 8 | 4 + 4 |

| 9 | 3 × 3 |

| 10 | 3 + 3 + 4 |

| 11+ | 三列瀑布 |

单图默认 16:9（原来 1:1 裁剪过紧），所有图片容器 + 注释磨砂层 border-radius 归零。

#### 管理后台 UX 统一

- Action button 全部直角 + 语义色（编辑蓝 / 通过绿 / 垃圾私密琥珀 / 删除红）
- Posts 列表 9 列：单行铺满、分类独立成列带图标、关键词展开成 pill（以前只显数字）
- 侧边栏有子 tab 的三项（文章 / 娱乐 / 媒体）高度与其他项对齐
- 评论管理 tabs + 搜索同行排布
- 菜单管理新增「从已有页面添加」选择器（含内置页/自定义页/分类）

#### 其他

- `==高亮==` markdown 语法支持（之前字面量输出）
- 评论通知邮件：Subject 和 From 做 RFC 2047 编码，解决中文头导致 body 被部分服务器丢弃的问题；Render 空输出直接报错不再静默发空信
- `getOptions()` 改用 tag-based 失效，后台存设置后前端立即生效（原来要等最多 10 秒）

---

**Full Changelog**: https://github.com/utterlog/utterlog/compare/v1.0.18...v1.1.0


---

## [1.0.18] - 2026-04-22

### 修复

**Azure 主题 Header 未配置菜单时仍显示硬编码默认项**

`web/themes/Azure/Header.tsx` 里有 `defaultNavItems` 常量，当 `menus.header` 为空时兜底渲染「首页 / 关于 / 归档 / 说说 / 友链 / 订阅 / 娱乐↓」。用户明确表示「菜单应该完全由后台控制」—— 没配置就不显示，而不是给硬编码

改为 `menus.header ?? []`，无配置 = 空数组 = Header 只剩 logo + 搜索框。想要传统导航就去 主题 → 菜单 → 顶部导航 → 点「重置默认」，一键填入 6 项


---

## [1.0.17] - 2026-04-22

### 改动

**主题页**（`/themes`）新增 tabs：**主题** / **菜单** / **页脚图标**

- 菜单管理从独立 `/menus` 页面移到主题页内。侧边导航的「菜单」入口移除
- 旧 `/menus` URL 会 301 到 `/themes`，老书签不会 404
- 页脚图标编辑器也从原来的主题页底部独立出一个 tab，结构更清晰


---

## [1.0.16] - 2026-04-22

### 修复

**运行时间显示「1 分钟」** —— `time.Since(startTime)` 读的是 api 进程启动时间，每次 docker compose up -d 重建容器就归零。服务器跑了 9 天，后台看到 1 分钟，没法用来判断服务健康状况。

改为读 `/proc/uptime` —— Linux 内核不对 uptime 做 namespace 隔离，非特权容器读出来就是宿主机的 uptime（已验证：容器里读到 860230 秒，宿主 `uptime` 命令也是 9 days 22:57，完全一致）。输出格式 `9天 22小时 57分钟`，macOS dev 环境没 `/proc/uptime` 就 fallback 到进程 uptime。


---

## [1.0.15] - 2026-04-22

升级 sidecar 在 `docker compose pull && up -d` 前会从 utterlog.io 重新下载 `docker-compose.yml`，让既有安装在后续一键升级时自动同步新挂载（如 `/etc/os-release`、`/etc/hostname` 用于系统状态展示）。


