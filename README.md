# Utterlog

<p>
  <a href="https://github.com/utterlog/utterlog/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/utterlog/utterlog/ci.yml?branch=main&style=flat-square&label=CI" alt="CI">
  </a>
  <a href="https://github.com/utterlog/utterlog/actions/workflows/docker-publish.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/utterlog/utterlog/docker-publish.yml?branch=main&style=flat-square&label=Docker%20Images&logo=docker&logoColor=white" alt="Docker Images">
  </a>
  <a href="https://github.com/utterlog/utterlog/releases">
    <img src="https://img.shields.io/github/v/release/utterlog/utterlog?style=flat-square&label=Release" alt="Release">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/utterlog/utterlog?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/utterlog/utterlog/stargazers">
    <img src="https://img.shields.io/github/stars/utterlog/utterlog?style=flat-square" alt="GitHub Stars">
  </a>
  <a href="https://github.com/utterlog/utterlog/issues">
    <img src="https://img.shields.io/github/issues/utterlog/utterlog?style=flat-square" alt="Issues">
  </a>
</p>

<p>
  <a href="https://demo.utterlog.io"><img src="https://img.shields.io/badge/在线演示-demo.utterlog.io-22c55e?style=for-the-badge&logo=safari&logoColor=white" alt="Live Demo" height="38"></a>
  <a href="https://utterlog.io"><img src="https://img.shields.io/badge/产品主页-utterlog.io-3b82f6?style=for-the-badge&logo=hugo&logoColor=white" alt="Website" height="38"></a>
  <a href="https://github.com/utterlog/utterlog/releases"><img src="https://img.shields.io/badge/下载-Latest%20Release-0f172a?style=for-the-badge&logo=github&logoColor=white" alt="Latest Release" height="38"></a>
</p>

Utterlog 是一个给独立作者、个人站长和内容型小团队使用的自托管个人站系统。

它不是只用来写文章的博客程序。你可以用它写长文、发说说、整理相册、记录足迹、管理友链、开放评论、聚合订阅，也可以把 AI 作为写作和阅读辅助放进自己的站点里。所有内容都运行在你的服务器、你的域名和你的数据库中。

## 适合谁

- 想把个人网站长期经营下去的独立作者
- 希望摆脱平台限制、保留完整内容资产的博客用户
- 需要文章、评论、相册、足迹、友链和订阅统一管理的站长
- 想把 AI 辅助写作、评论审核和文章陪读接入个人站点的人
- 需要一个可自定义主题、可迁移、可备份的自托管内容系统的人

## 你可以用 Utterlog 做什么

**写作与发布**

用 Markdown 写文章和页面，配置封面、摘要、分类、标签、固定链接和公开编号。系统会自动生成归档、分类、标签、RSS、站点地图和搜索入口。

**互动与社区**

开启评论、回复、审核、邮件通知和验证码。你可以把个人博客做成一个安静的阅读空间，也可以让它承载长期讨论。

**生活与收藏**

用说说记录短内容，用相册整理图片，用足迹记录国家和城市，用音乐、电影、图书、游戏、好物和视频页面沉淀自己的兴趣和收藏。

**友链与订阅**

管理友情链接、分类、图标、头像、RSS 地址和展示样式。订阅页可以聚合友链 RSS，让自己的站点也成为阅读入口。

**AI 辅助**

AI 可以辅助生成摘要、关键词、Slug、排版建议、封面提示词，也可以用于评论审核、智能回复和文章页陪读。它是编辑助手，不替代作者。

**主题与个性化**

内置 Utterlog、Azure、Renascent、Flux、Chred 等主题。你可以切换站点风格，配置菜单、Logo、Favicon、页脚按钮和主题专属选项。

## 产品特性

- 自托管：内容、附件和数据都在自己的服务器里
- 多内容形态：文章、页面、说说、相册、足迹、友链、订阅和收藏页
- 完整后台：写作、媒体、评论、主题、统计、设置和备份集中管理
- 可迁移：支持固定链接、站点 URL、附件地址和主题切换
- 可扩展：主题、插件、第三方服务和 AI provider 可按需配置
- 面向长期使用：SEO、RSS、评论、统计、备份、多语言和时区都是基础能力

## 快速开始

已有 Docker 环境时，可以一行安装：

```bash
curl -fsSL https://utterlog.io/install.sh | bash
```

国内服务器默认会使用阿里云 Docker 安装源和 Docker Hub 镜像加速，避免卡在 Docker / PostgreSQL / Utterlog app 镜像拉取。Bun 版默认只需要 `app + postgres`，Redis 不再是核心依赖。Utterlog 应用镜像会先探测 `registry.utterlog.io`，不可读时自动写入 `ghcr.io/utterlog` 继续安装。安装脚本只暴露本机 `127.0.0.1:9260`，生产环境请用 1Panel、宝塔、nginx 或 Caddy 反代到这个端口。

需要从源码安装或启用内置 Caddy 自动 HTTPS 时：

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | DOMAIN=blog.yoursite.com bash
```

安装完成后，按终端输出访问后台，创建管理员账号，然后在后台完成站点基础配置。

安装脚本会自动准备运行环境、生成必要配置并启动站点。生产镜像以 GitHub Container Registry 为权威源，`registry.utterlog.io` 作为可探测镜像源使用，普通用户通常不需要手动处理镜像地址。

## 文档与链接

- 在线演示：[demo.utterlog.io](https://demo.utterlog.io)
- 产品主页：[utterlog.io](https://utterlog.io)
- 安装指南：[INSTALL.md](INSTALL.md)
- 反代和部署：[deploy/README.md](deploy/README.md)
- 更新日志：[CHANGELOG.md](CHANGELOG.md)
- WordPress 导入插件：[utterlog-sync](https://github.com/utterlog/utterlog-sync)

## License

Utterlog 使用 [MIT License](LICENSE) 发布。
