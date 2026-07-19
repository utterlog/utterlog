# TanStack Start 全栈迁移

Utterlog 已统一为 **TanStack Start + React 19 + TanStack Router + Bun 1.4**。本文件记录完成后的架构边界和验证方式。

## 请求链

```text
Browser
  -> Bun + Hono gateway
     -> static uploads, themes, Start assets and admin assets
     -> TanStack Start
        -> public SSR routes
        -> admin entry
        -> API Server Routes
        -> PostgreSQL services
```

Hono 只负责安全头、请求体限制、限流、CORS、安装跳转和静态文件。页面、RSS、SEO 文本、后台入口及 `/api/*` 均由 TanStack Start 路由树处理。

## 源码边界

| 目录 | 职责 |
|---|---|
| `app/start/src/routes` | 页面与 API 文件路由 |
| `app/start/src/server` | 页面 loader、文档和主题上下文 |
| `app/web/components` | React 页面与共享组件 |
| `app/web/themes` | 内置主题组件和主题样式 |
| `app/start/src/backend` | PostgreSQL、认证、业务服务和 Bun 网关 |
| `app/admin/src` | 管理后台 SPA 源码 |

公开页面使用显式文件路由。唯一的 `routes/$.tsx` 仅用于后台配置的自定义文章固定链接，并在无法解析时交给 TanStack Router 的 404 页面。

## 构建

- `app/web/styles/globals.css` 由 `@tailwindcss/vite` 进入 Start 客户端构建。
- 主题 CSS 通过 `/themes/<theme>/styles.css` 加载。
- Start 客户端 chunk 由 `/assets/*` 提供。
- 生产镜像固定官方 Bun canary 摘要，镜像内版本为 `1.4.0`。

不再需要前端模式开关、内部 API URL、独立博客 hydration bundle 或框架兼容 shim。

## 验证

```bash
bun install --frozen-lockfile
bun run server:check
bun run start:check
bun run build:admin
bun run start:build
bun run test:server
docker compose config
```

运行后检查：

- 页面响应包含 `x-utterlog-renderer: tanstack-start`。
- `/feed`、`/rss`、`/rss.xml`、`/atom.xml` 返回 RSS。
- 未知 `/api/*` 返回 JSON 404。
- 未知页面进入主题 404。
