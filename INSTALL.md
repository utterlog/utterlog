# Utterlog 安装指南

生产部署直接运行 Bun 进程，由 systemd 管理。默认安装目录是 `/opt/utterlog`，应用仅监听 `127.0.0.1:9260`。

## 环境要求

- 64 位 Linux，使用 systemd
- Debian/Ubuntu 可由脚本自动安装 PostgreSQL 19 + pgvector
- 其他发行版需先准备 PostgreSQL 19 + pgvector，或使用外部数据库
- root 或 sudo 权限

Bun 1.4、Git、PostgreSQL 客户端等主机依赖由安装脚本补齐。

### PostgreSQL 版本

Utterlog 使用 **PostgreSQL 19** 和 pgvector。Debian/Ubuntu 安装器从 PGDG 正式软件源安装 PostgreSQL 19 和对应的客户端。外部数据库也应使用 19，执行备份的主机需要 PostgreSQL 19 的 `pg_dump`。

已有 PostgreSQL 18 或 Docker 实例时，先按[迁移指南](#迁移旧实例到-postgresql-19)准备并验证目标库，再更新应用。

## 一行安装

```bash
curl -fsSL https://github.com/utterlog/utterlog/releases/latest/download/install.sh | sudo bash
```

指定公开域名：

```bash
curl -fsSL https://github.com/utterlog/utterlog/releases/latest/download/install.sh \
  | sudo DOMAIN=blog.example.com bash
```

脚本会：

1. 从 GitHub Release 获取与正式版本标签绑定的安装器，并检出该版本到 `/opt/utterlog`。
2. 安装 Bun 1.4+ 和主机依赖。
3. 创建 `.env`，生成数据库密码和 JWT 密钥，选择空闲端口。
4. 准备本机 PostgreSQL 19 和 pgvector，或验证 `.env` 中的外部 PostgreSQL 19。
5. 安装依赖，执行类型检查、构建、测试和 API 覆盖审计。
6. 安装并启动 `utterlog-app.service` 与后台更新任务。
7. 访问健康检查接口，确认服务可用。

已有 systemd 实例请使用 `make update`。需要验证开发分支时，可以显式传 `sudo UTTERLOG_REF=main bash`。

## 使用外部 PostgreSQL

首次安装前传入数据库配置：

```bash
curl -fsSL https://github.com/utterlog/utterlog/releases/latest/download/install.sh \
  | sudo DB_HOST=db.example.internal \
      DB_PORT=5432 \
      DB_NAME=utterlog \
      DB_USER=utterlog \
      DB_PASSWORD='replace-me' \
      bash
```

请提前创建 PostgreSQL 19 数据库，由管理员启用 `vector` 扩展，并让应用角色拥有站点表和序列。

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

## 迁移旧实例到 PostgreSQL 19

1. 在旧站进入维护窗口后，记录数据库连接、`DB_PREFIX`、`APP_URL`、`JWT_SECRET` 和文件目录。备份原数据库及 `uploads/`、`content/`。Docker 部署从原 Compose 配置和数据卷读取这些值。
2. 在独立端口或服务器创建 PostgreSQL 19 目标库，启用 pgvector，并用普通应用账号连接。迁移演练和正式切换分别使用独立目标库。
3. 使用 PostgreSQL 19 客户端对旧库做逻辑导出，再恢复到**空的**目标库。按实际前缀调整 `ul_`，使用环境变量或 `.pgpass` 提供凭据。

   ```bash
   pg_dump --dbname="$OLD_DATABASE_URL" --format=custom --no-owner --no-acl \
     --strict-names --table='public.ul_*' --file=utterlog-site.dump
   pg_restore --dbname="$NEW_DATABASE_URL" --exit-on-error --single-transaction \
     --no-owner --no-acl utterlog-site.dump
   ```

4. 将站点文件复制到新的应用目录，并配置 `.env` 指向目标库。旧 Docker 部署可先将迁移配置和文件放在新安装目录之外，安装时传入 PostgreSQL 19 连接参数，再将站点目录同步到对应位置。测试管理员登录、首页、文章、评论、媒体和恢复后，再切换反向代理。
5. 保留旧数据库和站点文件，直到确认新站能独立运行并完成一次备份。切回旧站前先处理迁移后新增的内容。

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

后台“一键升级”通过 `utterlog-update.path` 触发同一个脚本。脚本先在独立目录构建，再切换源码和产物，并检查数据库、运行提交、首页和后台。失败时回退应用源码和产物。升级前请备份数据库，数据库主版本迁移和已提交的 schema 迁移需按各自的备份恢复流程处理。

如果旧 systemd 实例还没有 `scripts/check-host.sh`，第一次使用新版升级器时执行 `curl -fsSL https://github.com/utterlog/utterlog/releases/latest/download/update-bun.sh | sudo UTTERLOG_INSTALL_DIR=/opt/utterlog bash`。已有 PostgreSQL 18 实例先完成数据库迁移。

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
