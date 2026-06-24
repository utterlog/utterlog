# app/web/ — Utterlog 博客前端

React 19 + TypeScript 博客页面与主题源码。**不是独立进程** — 由根目录 Bun app（`app/server`）在同一容器内做 SSR 与静态资源分发。

> 项目整体介绍、部署、特性，看根目录 [README.md](../../README.md)。本文档只讲 app/web 子模块。

## 角色

```
浏览器
  ↓
Bun app (:8080)       ← 唯一对外端口（生产 9260）
  ├─ /admin/*    嵌入后台 SPA
  ├─ /api/*      TypeScript handlers
  ├─ /themes/*   主题 CSS/资源
  ├─ /static/*   客户端 hydration bundle
  └─ /*          Bun React SSR（app/server/src/web/router.ts）
```

SSR 走 `INTERNAL_API_URL=http://127.0.0.1:8080/api/v1`，客户端 fetch 走 `NEXT_PUBLIC_API_URL=/api/v1`（同源相对路径，无 CORS）。

## 目录关键点

| 路径 | 内容 |
|------|------|
| [app/(blog)/](app/(blog)) | 博客所有公开页（首页 / 文章 / 归档 / 标签 / 链接 / 音乐 / 说说） |
| [app/install/](app/install) | 首次安装向导（三步） |
| [themes/](themes) | 内置主题（Utterlog / Azure / Renascent / Flux / Chred / Nebula） |
| [components/blog/](components/blog) | 共享博客组件（主题内重复文件已改为 re-export） |
| [lib/api.ts](lib/api.ts) | 客户端 API 封装（带 token 刷新） |
| [lib/blog-api.ts](lib/blog-api.ts) | SSR 调用，走 INTERNAL_API_URL |

安装门控与 `/feed` 代理在 `app/server/src/web/install-gate.ts`，不在本目录。

## 开发

根目录一键启动：

```bash
make dev
# 或
bun run server:dev
```

主题样式同步：

```bash
cd app/web && bun run sync:themes
```
