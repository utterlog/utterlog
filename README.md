<div align="center">

<img src="https://utterlog.io/icon.svg" width="80" height="80" alt="Utterlog" />

# Utterlog

**基于 TanStack Start 与 Bun 的自托管个人内容平台**

[![CI](https://img.shields.io/github/actions/workflow/status/utterlog/utterlog/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/utterlog/utterlog/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/utterlog/utterlog?style=flat-square)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.4.0-black?style=flat-square&logo=bun)](https://bun.sh)
[![React](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react)](https://react.dev)

</div>

Utterlog 面向独立作者和个人站长，统一管理文章、说说、评论、媒体、相册、足迹、友链、订阅、统计与 AI 工具。数据、数据库和附件均由站长自行托管。

## 功能

- 文章、页面、说说、评论和媒体管理
- 相册、足迹、友链、音乐与内容收藏
- 服务端渲染、固定链接、SEO、RSS 和站点地图
- 多主题、深色模式和后台可视化设置
- Passkey、双因素认证和安全管理
- PostgreSQL 备份及 WordPress、Typecho 数据导入
- 可配置 AI Provider、摘要、标签、配图和阅读助手

## 技术栈

| 层 | 技术 |
|---|---|
| 全栈框架 | TanStack Start |
| UI | React 19 |
| 路由与数据 | TanStack Router、TanStack Query |
| 运行时 | Bun 1.4 |
| 语言与构建 | TypeScript 7、Vite 8 |
| 数据库 | PostgreSQL + pgvector |
| 样式 | Tailwind CSS 4 |
| 部署 | Bun、systemd、Nginx 或 Caddy |

前台、后台入口和全部 API 已迁移到 TanStack Start Server Routes，并由同一个 Bun 进程提供服务。

## 快速开始

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | sudo bash
```

指定域名并启用自动 HTTPS：

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | sudo DOMAIN=blog.example.com bash
```

默认服务监听 `127.0.0.1:9260`，生产环境请使用 Nginx、Caddy、1Panel 或宝塔反向代理。

## 本地开发

需要 Bun 1.4 和可用的 PostgreSQL 数据库。

```bash
bun install
bun run dev
```

TanStack Start 开发与检查：

```bash
bun run start:dev
bun run start:check
bun run start:build
```

服务端检查与测试：

```bash
bun run server:check
bun test
```

## 部署

```bash
make deploy
make update
make logs
```

详细说明见 [INSTALL.md](INSTALL.md) 和 [deploy/README.md](deploy/README.md)。

## 维护者

[Utterlog contributors](https://github.com/utterlog/utterlog/graphs/contributors)

## License

[MIT](LICENSE)
