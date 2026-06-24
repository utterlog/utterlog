<div align="center">

<img src="https://utterlog.io/icon.svg" width="80" height="80" alt="Utterlog" />

# Utterlog

**为独立作者打造的一体化自托管内容平台**

<p>
  <a href="https://github.com/utterlog/utterlog/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/utterlog/utterlog/ci.yml?branch=main&style=flat-square&label=CI" alt="CI"></a>
  <a href="https://github.com/utterlog/utterlog/actions/workflows/docker-publish.yml"><img src="https://img.shields.io/github/actions/workflow/status/utterlog/utterlog/docker-publish.yml?branch=main&style=flat-square&label=Docker&logo=docker&logoColor=white" alt="Docker"></a>
  <a href="https://github.com/utterlog/utterlog/releases"><img src="https://img.shields.io/github/v/release/utterlog/utterlog?style=flat-square&label=Release" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/utterlog/utterlog?style=flat-square" alt="License"></a>
  <a href="https://github.com/utterlog/utterlog/stargazers"><img src="https://img.shields.io/github/stars/utterlog/utterlog?style=flat-square" alt="Stars"></a>
</p>

<p>
  <a href="https://demo.utterlog.io"><img src="https://img.shields.io/badge/在线演示-demo.utterlog.io-22c55e?style=for-the-badge&logo=safari&logoColor=white" height="36" alt="Demo"></a>
  <a href="https://utterlog.io"><img src="https://img.shields.io/badge/产品主页-utterlog.io-3b82f6?style=for-the-badge" height="36" alt="Website"></a>
  <a href="https://github.com/utterlog/utterlog/releases"><img src="https://img.shields.io/badge/下载-Latest%20Release-0f172a?style=for-the-badge&logo=github&logoColor=white" height="36" alt="Release"></a>
</p>

</div>

Utterlog 是给独立作者、个人站长和小型内容团队用的自托管站点系统。除了长文博客，还支持说说、相册、足迹、友链、订阅聚合和 AI 辅助写作/阅读——数据、附件和数据库都在你自己的服务器上。

## 亮点

| | |
|---|---|
| **一体化** | 文章、页面、评论、媒体、主题、统计、备份、设置统一后台 |
| **轻量部署** | 默认 `app + PostgreSQL` 两个容器，单端口对外，约 600MB 内存可跑 |
| **数据自主** | WordPress / Typecho 导入，固定链接、备份包、主题与附件可迁移 |
| **联盟能力** | Utterlog Network 跨站登录、评论、关注；Passkey + 2FA |
| **AI 辅助** | 摘要、关键词、评论审核、文章陪读（可配置 Provider） |

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Bun + TypeScript |
| API / 网关 | Hono（单进程） |
| 博客前台 | React SSR |
| 管理后台 | Vite + React |
| 数据库 | PostgreSQL 18 + pgvector |
| 部署 | Docker Compose，可选内置 Caddy |

Bun 版运行时内置 **Azure**、**Nebula** 两套主题；Azure 支持蔚蓝 / 中国红配色切换。

## 快速开始

```bash
curl -fsSL https://utterlog.io/install.sh | bash
```

带自动 HTTPS：

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | DOMAIN=blog.yoursite.com bash
```

脚本会自动检测环境、生成配置、拉取镜像并启动。默认只监听 `127.0.0.1:9260`，生产环境用 Nginx / Caddy / 1Panel / 宝塔反代即可。

安装后访问终端输出的后台地址，创建管理员并完成站点基础设置。

## 常用命令

```bash
make deploy    # 初次部署
make update    # 拉代码并重新部署
make logs      # 查看日志
```

## 相关仓库

| 仓库 | 说明 |
|------|------|
| [utterlog-sync](https://github.com/utterlog/utterlog-sync) | WordPress 导入 / 同步插件 |
| [UtterlogSync](https://github.com/utterlog/UtterlogSync) | Typecho 同步插件 |

## 文档

- [INSTALL.md](INSTALL.md) — 安装与更新
- [deploy/README.md](deploy/README.md) — 反代与生产部署
- [CHANGELOG.md](CHANGELOG.md) — 更新日志
- [utterlog.io](https://utterlog.io) — 产品主页
- [demo.utterlog.io](https://demo.utterlog.io) — 在线演示

## License

[MIT](LICENSE)
