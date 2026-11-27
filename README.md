<div align="center">

<img src="https://raw.githubusercontent.com/utterlog/utterlog/main/app/start/src/web/public/favicon.svg" width="80" height="80" alt="Utterlog" />

# Utterlog

**用于个人写作与内容归档的自托管博客系统**

*An open-source, self-hosted publishing system for personal blogs.*

[![CI](https://img.shields.io/github/actions/workflow/status/utterlog/utterlog/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/utterlog/utterlog/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/utterlog/utterlog?style=flat-square)](https://github.com/utterlog/utterlog/releases)
[![License](https://img.shields.io/github/license/utterlog/utterlog?style=flat-square)](LICENSE)

[官网](https://utterlog.io) · [安装指南](INSTALL.md) · [开发说明](DEVELOPMENT.md) · [更新日志](CHANGELOG.md)

</div>

## 功能

- 发布文章、页面和说说，管理评论、媒体库、相册、足迹、音乐与收藏。
- 支持内置主题与深色模式、自定义固定链接、RSS、站点地图和访问统计。
- 管理友情链接和站外订阅。
- 从 WordPress 或 Typecho 导入内容，并通过管理后台备份站点。
- 管理后台支持 Passkey 登录与双因素认证。
- 接入自选 AI 服务与模型，用于文章摘要、标签建议、配图和文章问答。

## 架构

博客前台使用 TanStack Start 服务端渲染，管理后台采用单页应用模式。两者使用 React 19 和 Tailwind CSS 4，并通过 Vite 构建。

一个 Bun 进程在同一端口提供博客前台、`/admin` 和 `/api/v1`。后端使用 TypeScript，数据存于 PostgreSQL 19，需要启用 `pgvector`。媒体文件支持本地磁盘以及 S3、Cloudflare R2 等兼容的对象存储。

## 安装

安装脚本适用于使用 systemd 的 64 位 Linux。在 Debian 和 Ubuntu 上，脚本可自动安装本地 PostgreSQL 和 `pgvector`。已有数据库也可直接接入，配置见 [安装指南](INSTALL.md)。

```bash
curl -fsSL https://utterlog.io/install.sh | sudo bash
```

使用公开域名时，可在运行安装器时指定 `DOMAIN`。

```bash
curl -fsSL https://utterlog.io/install.sh | sudo DOMAIN=blog.example.com bash
```

服务默认监听 `127.0.0.1:9260`。通过公开域名访问时，请在反向代理上配置 HTTPS。首次访问 `/install`，按向导创建管理员并设置站点信息。 [反向代理配置](deploy/README.md)

## 本地开发

准备 Bun 1.4.5 和启用了 `pgvector` 的 PostgreSQL。将 `.env.example` 复制为 `.env`，填写数据库连接、`JWT_SECRET` 和 `APP_URL`，然后在仓库根目录运行以下命令。 [开发说明](DEVELOPMENT.md)

```bash
bun install --frozen-lockfile
bun run build
bun run dev
```

默认开发地址为 `http://localhost:9260`。完整校验可以运行 `bun run verify`，其中包含类型检查、构建、服务端测试和 API 覆盖检查。

## 运维

```bash
make update   # 拉取更新、构建并重启服务
make status   # 查看服务状态
make logs     # 跟踪服务日志
```

管理后台也可通过 systemd 更新应用。部署与运维命令在服务器上的安装目录中执行，默认目录为 `/opt/utterlog`。 [更新与运维](INSTALL.md#更新与运维)

## 项目资料

[更新日志](CHANGELOG.md) · [历史版本](RELEASE_HISTORY.md) · [贡献者](https://github.com/utterlog/utterlog/graphs/contributors) · [MIT 许可证](LICENSE)
