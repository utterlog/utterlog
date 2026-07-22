# 通过 SSH 部署到自建服务器

该流程用于服务器已经完成标准安装、`utterlog-app.service` 正常运行之后。它在本地用 Bun 校验和构建，再同步源码及构建产物并重启远程 systemd 服务。

## 前置条件

- 本地：Bun 1.4+、Git、rsync、SSH
- 服务器：已执行 [标准安装](../../INSTALL.md)，存在 `.env` 与 `utterlog-app.service`
- SSH 用户能写入部署目录并执行 `systemctl restart`

## 配置

```bash
export UTTERLOG_SSH_KEY="$HOME/.ssh/your-key.pem"
export UTTERLOG_DEPLOY_HOST='<your-server-ip>'
export UTTERLOG_DEPLOY_USER='root'
export UTTERLOG_DEPLOY_PATH='/opt/utterlog'
export UTTERLOG_SERVICE='utterlog-app'
export UTTERLOG_REMOTE_BUN='/opt/bun/bin/bun'
export UTTERLOG_APP_URL='https://blog.example.com'
```

`UTTERLOG_REMOTE_PORT` 可选；未设置时脚本读取服务器 `.env` 的 `PORT`。

## 部署

```bash
make deploy-utterlog-dry   # 本地完整校验，不同步
make deploy-utterlog       # 构建、同步、安装依赖、重启、健康检查
```

也可以直接运行：

```bash
bash scripts/deploy-utterlog-bun.sh
bash scripts/deploy-utterlog-bun.sh --skip-tests
bash scripts/deploy-utterlog-bun.sh --no-build
```

脚本不会同步或删除远程 `.env`、`uploads/`、`content/`、`backup/`。`--no-build` 只适合本地已有有效 `app/admin/dist` 与 `app/start/dist` 的情况。

## 运维

```bash
ssh -i "$UTTERLOG_SSH_KEY" root@"$UTTERLOG_DEPLOY_HOST"
systemctl status utterlog-app --no-pager
journalctl -u utterlog-app -f
curl -i http://127.0.0.1:9260/api/v1/install/status
```

常规线上更新优先在服务器执行 `sudo bash /opt/utterlog/scripts/update-bun.sh`，它会保留当前分支并只接受快进更新。
