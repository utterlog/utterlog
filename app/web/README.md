# app/web/ — Utterlog 博客前端

Next.js 16 + React 19 + TypeScript 6 渲染的博客前端。**不是独立产品** — 配合根目录的 Bun app 一起跑，由 Bun 网关反代到本服务。

> 项目整体介绍、部署、特性，看根目录 [README.md](../../README.md)。本文档只讲 app/web 子模块开发。

## 角色

```
浏览器
  ↓
Bun app (:8080)       ← 唯一对外端口（生产 9260）
  ├─ /admin/*    embed 后台 SPA
  ├─ /api/*      TypeScript handlers
  └─ /*          反代到同容器内的 Next.js renderer
```

web renderer 仅在 app 容器内部可达，**不直接暴露公网端口**。SSR 走 `INTERNAL_API_URL=http://127.0.0.1:8080/api/v1`，客户端 fetch 走 `NEXT_PUBLIC_API_URL=/api/v1`（同源相对路径，无 CORS）。

## 目录关键点

| 路径 | 内容 |
|------|------|
| [app/(blog)/](app/(blog)) | 博客所有公开页（首页 / 文章 / 归档 / 标签 / 链接 / 音乐 / 说说） |
| [app/install/](app/install) | 首次安装向导（三步） |
| [app/feed/](app/feed) | RSS 聚合阅读 |
| [themes/](themes) | 内置主题（Utterlog / Azure / Renascent / Flux / Chred），每套独立清单 + 样式 |
| [plugins/](plugins) | 第三方扩展加载点，见 [plugins/README.md](plugins/README.md) |
| [proxy.ts](proxy.ts) | API 不可达时强制跳 `/install` 的 fail-closed 代理 |
| [lib/api.ts](lib/api.ts) | 客户端 API 封装（带 token 刷新） |
| [lib/blog-api.ts](lib/blog-api.ts) | SSR 调用，走 INTERNAL_API_URL |

## 单独开发本子模块

通常用根目录 `make dev` 一起跑就够了。需要单独跑 web 调试远程 API 时，可以临时指定远程地址；这只建议用于本地开发。生产部署保持 `NEXT_PUBLIC_API_URL=/api/v1`，由 Bun app 同源反代 API，避免浏览器跨域和 token 泄露风险。

```bash
cd app/web
bun install
NEXT_PUBLIC_API_URL=https://your-api.com/api/v1 \
INTERNAL_API_URL=https://your-api.com/api/v1 \
bun run dev   # http://localhost:3000
```

远程 API 只有在服务端 `CORS_ORIGIN` 显式允许当前开发源站时才会被浏览器读取。不要在生产环境设置 `CORS_ORIGIN=*`；Bun 服务在 production 模式会拒绝这种配置。

## 主题开发

每套主题在 `themes/{Name}/`：

- `theme.json` — 清单（name / version / colors）
- 必须导出：`Header` / `Footer` / `Layout` / `HomePage` / `PostPage` / `PostCard`
- 可选：`PageFooterIcons`（自定义页脚图标按钮）

后台 → 主题管理切换，或上传 zip 自定义主题。
