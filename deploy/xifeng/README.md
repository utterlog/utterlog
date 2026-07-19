# xifeng.net 部署

站点：**https://xifeng.net**  
服务器：`124.222.230.137`（Debian 13，x86_64）
部署目录：`/opt/utterlog-xifeng`

## 三端一致

| 端 | 含义 | 如何核对 |
|---|---|---|
| **本地 Git** | `git rev-parse HEAD` | 部署前必须 commit |
| **远程 Git** | `origin/<branch>` | 脚本默认 `git push` 后比对 SHA |
| **服务器容器** | `/app/.deploy-revision` | 部署后自动校验 |

不走 GitHub Actions。优先在本地 `docker build` + `docker save | ssh load`；**本地无 Docker 时**自动改用 `git archive` + 服务器构建（与 Mac 无 Docker Desktop 场景相同）。

## 前置条件

- 本地：Docker、Bun 1.4.0+、Git
- SSH 私钥：`~/Desktop/gentpan.pem` 或 `~/.ssh/gentpan.pem`（或设 `UTTERLOG_SSH_KEY`）
- 服务器已有：`.env`、`uploads/`、`content/`、`pgdata/`（首次需手动初始化，见下方）

## 标准部署（每次发版）

```bash
# 1. 提交本地改动
git add -A && git commit -m "your message"

# 2. 一键部署（push + preflight + build + sync + 健康检查）
make deploy-xifeng
# 或
bash scripts/deploy-xifeng.sh
```

脚本会自动：

1. 检查工作区干净
2. `git push origin <当前分支>`
3. `bun install --frozen-lockfile` + typecheck + Admin/TanStack Start 构建 + 测试
4. `docker build --platform linux/amd64` 打标签 `utterlog-app:local` 和 `utterlog-app:<sha>`
5. 流式上传镜像到服务器并 `docker load`
6. 同步 `deploy/xifeng/docker-compose*.yml`
7. `docker compose up -d --force-recreate` 仅重启 app
8. 校验 `https://xifeng.net/api/v1/install/status` 与容器内 revision

## 常用变体

```bash
make deploy-xifeng-dry              # 只跑 preflight，不上传
bash scripts/deploy-xifeng.sh --no-push      # 不 push（远程已是最新时）
bash scripts/deploy-xifeng.sh --skip-tests   # 跳过测试（不推荐）
bash scripts/deploy-xifeng.sh --allow-dirty  # 允许未提交（破坏三端一致）
```

## 环境变量

```bash
export UTTERLOG_SSH_KEY=~/Desktop/gentpan.pem
export UTTERLOG_DEPLOY_HOST=124.222.230.137
export UTTERLOG_DEPLOY_PATH=/opt/utterlog-xifeng
export UTTERLOG_APP_URL=https://xifeng.net
```

## 服务器运维

```bash
ssh -i ~/Desktop/gentpan.pem root@124.222.230.137

cd /opt/utterlog-xifeng
docker ps
docker logs utterlog-xifeng-app --tail 50
docker exec utterlog-xifeng-app cat /app/.deploy-revision   # 当前运行的 Git SHA

# 回滚：使用 backup 镜像 tag
docker images utterlog-app
docker tag utterlog-app:backup-YYYYMMDDHHMMSS utterlog-app:local
docker compose -f docker-compose.bun.yml up -d --force-recreate --no-deps app
```

## 首次初始化（仅一次）

若 `/opt/utterlog-xifeng` 尚未存在，在服务器上：

```bash
mkdir -p /opt/utterlog-xifeng/{uploads,content,pgdata}
docker network create utterlog_default
# 从本地 scp .env（含 DB/JWT/APP_URL 等密钥，勿提交 Git）
docker compose -f docker-compose.infra.yml up -d
# 首次 app 镜像由 deploy-xifeng.sh 上传
```

`.env` 与 `uploads/`、`pgdata/` **不会**被部署脚本覆盖。
