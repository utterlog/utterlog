# 反向代理配置

Utterlog 默认绑定 `127.0.0.1:9260`。按部署环境选择 [1Panel](1panel.md)、[Nginx](nginx.conf.example) 或 [Caddy](Caddyfile.example) 配置。

## 单端口架构

Bun app 是唯一入口：

- `/admin/*`：管理后台入口和静态资源
- `/api/*`：TanStack Start Server Routes
- `/assets/*`：TanStack Start 客户端 chunk
- `/uploads/*`：用户上传文件
- `/themes/*`：内置及用户主题资源
- 其他地址：TanStack Start SSR

反向代理只需转发到 `127.0.0.1:9260`，不需要单独代理前端或 API 进程。

## 请求头

请透传 `X-Real-IP`、`X-Forwarded-For`、`X-Forwarded-Proto` 和 `X-Forwarded-Host`。AI 流式输出还需要关闭代理缓冲并提高读取超时。

## 缓存

`/assets/*` 与 `/admin/assets/*` 是带 hash 的构建资源，可以配置：

```text
Cache-Control: public, max-age=31536000, immutable
```

`/themes/*` 通过主题版本参数更新，不要在反向代理层永久固定无版本 URL。
