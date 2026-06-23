# 反向代理配置

Utterlog 默认绑 `127.0.0.1:9260`（或自动检测到的端口），不占 80/443。按你的情况选：

## 有 1Panel / 宝塔 / AAPanel → [1panel.md](1panel.md)
GUI 填两栏，自动 SSL。最省事。

## 有自己的 nginx → [nginx.conf.example](nginx.conf.example)
复制片段，改域名和端口，reload。

## 有自己的 Caddy → [Caddyfile.example](Caddyfile.example)
追加到 Caddyfile，reload。自动 TLS。

## 啥都没有 → 用内置 Caddy（零配置 TLS）
```bash
DOMAIN=blog.yoursite.com make deploy-tls
```
见根目录 `INSTALL.md` 场景 C。

---

## 单端口架构说明

Bun app 是唯一外部入口，内部分发：
- `/admin/*` → 嵌入的 Vite SPA
- `/api/v1/*` → TypeScript handlers
- `/uploads/*` → 本地文件
- `/themes/*` → 用户主题资源与内置主题资源
- 其他 → 内部反代到 Next.js 渲染进程

反代配置只需指向一个端口（`127.0.0.1:9260`），无需分路径处理。

### 必需的 HTTP 头传递

```
X-Real-IP         → 访客真实 IP（地理位置统计、防刷）
X-Forwarded-For   → 多层代理链
X-Forwarded-Proto → http/https（生成绝对链接用）
X-Forwarded-Host  → 原始域名
Upgrade/Connection → WebSocket / SSE（AI 流式输出必需）
```

各样例文件都配好了，直接用即可。

### 可缓存资源（长期）

- `/_next/static/*` — Next.js hash 化 chunk
- `/admin/assets/*` — Vite hash 化 chunk

这两个路径都是 content-addressed，可以 `max-age=31536000, immutable`。
