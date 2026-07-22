# Utterlog 安装指南

生产部署直接运行 Bun 进程，由 systemd 管理。默认安装目录是 `/opt/utterlog`，应用仅监听 `127.0.0.1:9260`。

## 环境要求

- 64 位 Linux，使用 systemd
- Debian/Ubuntu 可由脚本自动安装 PostgreSQL 18 + pgvector
- 其他发行版需先准备 PostgreSQL 18 + pgvector，或使用外部数据库
- root 或 sudo 权限

Bun 1.4、Git、PostgreSQL 客户端等主机依赖由安装脚本补齐。

## 一行安装

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh | sudo bash
```

指定公开域名：

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh \
  | sudo DOMAIN=blog.example.com bash
```

脚本会：

1. 克隆到 `/opt/utterlog`，已有安装则对当前分支执行快进更新。
2. 安装 Bun 1.4+ 和主机依赖。
3. 创建 `.env`，生成数据库密码和 JWT 密钥，选择空闲端口。
4. 准备本机 PostgreSQL 18 + pgvector，或验证 `.env` 中的外部数据库。
5. 安装依赖，执行类型检查、构建、测试和 API 覆盖审计。
6. 安装并启动 `utterlog-app.service` 与后台更新任务。
7. 访问健康检查接口，确认服务可用。

安装不会覆盖已有 `.env`、`uploads/` 或 `content/`。

## 使用外部 PostgreSQL

首次安装前传入数据库配置：

```bash
curl -fsSL https://raw.githubusercontent.com/utterlog/utterlog/main/install.sh \
  | sudo DB_HOST=db.example.internal \
      DB_PORT=5432 \
      DB_NAME=utterlog \
      DB_USER=utterlog \
      DB_PASSWORD='replace-me' \
      bash
```

数据库必须已存在并提供 pgvector。配置用户需要能够连接数据库，并能执行 `CREATE EXTENSION IF NOT EXISTS vector`。

也可以先编辑 `/opt/utterlog/.env`，再执行：

```bash
cd /opt/utterlog
sudo bash scripts/deploy.sh --skip-db-setup
```

辅助初始化现有数据库：

```bash
bash scripts/setup-pgvector.sh \
  --host 127.0.0.1 --port 5432 \
  --superuser postgres --superpass '<postgres-password>' \
  --db utterlog --user utterlog --pass '<utterlog-password>'
```

## 反向代理

在 1Panel、宝塔、Nginx 或 Caddy 中把域名转发到 `http://127.0.0.1:9260`。如果安装脚本选择了其他端口，以 `/opt/utterlog/.env` 中的 `PORT` 为准。

示例见 [deploy/README.md](deploy/README.md) 和 [deploy/1panel.md](deploy/1panel.md)。

## 更新与运维

```bash
cd /opt/utterlog

sudo bash scripts/update-bun.sh       # 拉源码、验证、构建、重启、健康检查
sudo systemctl restart utterlog-app
systemctl status utterlog-app --no-pager
journalctl -u utterlog-app -f
```

如果安装了 `make`，可使用等价快捷命令：

```bash
make update
make restart
make status
make logs
```

后台“一键升级”通过 `utterlog-update.path` 触发同一个 `scripts/update-bun.sh`，不会启动第二套应用运行环境。

## 故障排查

服务未启动：

```bash
systemctl status utterlog-app --no-pager
journalctl -u utterlog-app -n 100 --no-pager
```

端口或健康检查：

```bash
grep -E '^(HOST|PORT)=' /opt/utterlog/.env
curl -i http://127.0.0.1:9260/api/v1/install/status
```

数据库：

```bash
grep -E '^DB_(HOST|PORT|NAME|USER)=' /opt/utterlog/.env
sudo -u postgres psql -d utterlog -c '\dx vector'
```

## 更新 schema（开发）

```bash
bash scripts/dump-schema.sh
# 或 make schema
```

脚本直接使用 `.env` 中的 PostgreSQL 连接并原子替换 `app/start/assets/schema.sql`。
