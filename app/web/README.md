# `app/web` - Utterlog 前台 UI

这里保存 React 19 页面组件、主题、样式和浏览器端数据工具，由 `app/start` 直接导入并通过 TanStack Start 完成 SSR 与 hydration。它不是独立应用，也没有单独的开发服务器或构建产物。

## 请求链

```text
浏览器
  -> Bun + TanStack Start
     -> TanStack Router 页面与 Server Routes
     -> app/web React 组件和主题
     -> PostgreSQL 数据服务
```

浏览器 API 固定使用同源 `/api/v1`。服务端页面 loader 直接调用 `app/start/src/backend` 的共享服务，不再通过内部 HTTP 请求重复读取数据。

## 目录

| 路径 | 内容 |
|---|---|
| `components/pages/` | 关于、相册、Coding、订阅、足迹、友链、说说、音乐、安装和登录页面 |
| `components/blog/` | 文章、评论、导航、媒体和公共页面组件 |
| `themes/` | 内置主题及其 React 组件 |
| `styles/globals.css` | Tailwind CSS 4 入口和全局样式 |
| `lib/api.ts` | 浏览器端同源 API 客户端 |
| `lib/navigation.ts` | 主题组件使用的路由上下文 |

所有公开 URL 的文件路由位于 `app/start/src/routes/`，服务端页面数据位于 `app/start/src/server/public-pages.ts`。

## 开发

```bash
bun run start:dev
bun run start:check
bun run start:build
```

修改主题样式后同步公开主题资源：

```bash
bun run build:web
```
