# Bun 博客前台搬迁（已完成）

博客公开页已由 **Bun + React SSR** 直接渲染，不再依赖 Next.js 子进程。

## 架构

```
浏览器 → Bun (:8080)
           ├─ /api/*           Hono API
           ├─ /admin/*         Admin SPA (Vite 构建)
           ├─ /themes/*        主题 CSS
           ├─ /blog-static/*   globals.css + client.js
           └─ /*               app/server/src/web（Bun SSR）
```

## 主题

仅 **Azure**、**Nebula** 两套完整主题；数据库里其他主题名自动回落到 Azure。

## 已搬迁路由

- 博客：首页、分页、文章、归档、分类/标签、搜索、关于、说说、音乐、友链、聚合、足迹、影视、图书、游戏、好物、观影、编码、日期归档、自定义 permalink
- 独立页：`/install`、`/login`
- RSS：`/feed`、`/rss`、`/rss.xml`、`/atom.xml` → `/api/v1/feed`

## 环境变量

```bash
WEB_RENDERER=bun   # 默认
```

## 源码结构

| 路径 | 作用 |
|------|------|
| `app/server/src/web/` | SSR 路由、渲染、安装门控 |
| `app/blog/src/shims/` | Next 兼容层 |
| `app/blog/src/lib/` | blog-api、theme 注册表 |
| `app/web/` | 主题、组件、页面组件（复用） |

## 客户端水合（Bun SSR）

`#utterlog-page` 内由 `renderToString` 生成的 HTML **不会**被 React 水合；`'use client'` 组件里的 `useEffect`、点击事件在不重挂时均不生效。

**Layout 壳**（Header / Footer / TopProgress 等）在 `#root` 下水合，交互正常。

**已做客户端整页重挂**（`MountPageWidgets` + `live-page-registry`）：

| 类型 | 路由 |
|------|------|
| 首页 | `/`、`/page/:num` |
| 文章 | `/posts/:slug`、`/films/:slug`、自定义 permalink |
| 足迹 | `/footprints` |
| 强交互列表页 | `/moments`、`/links`、`/feeds`、`/albums`、`/music` |

**文章评论区** 通过 `data-utterlog-mount="comments"` 单独挂载。

其余以服务端渲染为主的页面（归档、分类、标签、搜索、关于、Coding 等）保持静态 HTML；纯展示无问题，若未来加复杂客户端交互需加入上表。

