# 用 1Panel、宝塔或 AAPanel 反代 Utterlog

先确认主机服务已启动：

```bash
systemctl status utterlog-app --no-pager
grep -E '^(HOST|PORT)=' /opt/utterlog/.env
```

默认目标是 `http://127.0.0.1:9260`；如果 `.env` 中的端口不同，以实际值为准。

## 1Panel

1. 进入“网站”→“创建网站”→“反向代理”。
2. 主域名填写自己的域名，代理地址填写 `http://127.0.0.1:9260`。
3. 在网站 HTTPS 设置中申请 Let's Encrypt 证书并启用强制 HTTPS。

## 宝塔 / AAPanel

1. 新建站点，只填写域名，不需要选择 PHP 或数据库。
2. 在站点“反向代理”中把目标 URL 设为 `http://127.0.0.1:9260`。
3. 申请证书并启用强制 HTTPS。
4. 为流式响应加入以下 Nginx 配置：

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_buffering off;
proxy_read_timeout 300s;
```

## 验证

```bash
curl -i http://127.0.0.1:9260/api/v1/install/status
journalctl -u utterlog-app -n 100 --no-pager
```

浏览器访问公开域名后应看到安装向导；完成初始化后 `/admin` 可进入后台。

## 常见问题

### 502 Bad Gateway

检查 `utterlog-app` 是否运行、反向代理端口是否与 `.env` 一致：

```bash
systemctl status utterlog-app --no-pager
grep '^PORT=' /opt/utterlog/.env
journalctl -u utterlog-app -n 100 --no-pager
```

### AI 流式输出卡顿

确认已关闭代理缓冲，并把 `proxy_read_timeout` 提高到至少 300 秒。

### 后台能打开但博客 404

重新执行构建并查看服务日志：

```bash
cd /opt/utterlog
bun run build
sudo systemctl restart utterlog-app
journalctl -u utterlog-app -n 100 --no-pager
```
