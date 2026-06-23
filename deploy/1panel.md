# 用 1Panel / 宝塔 / AAPanel 反代 Utterlog

如果你 VPS 上已经装了 1Panel、宝塔面板、或 AAPanel，不需要改配置文件，
GUI 里两栏搞定。

## 前提：Utterlog 已在 `127.0.0.1:<端口>` 跑起来

```bash
make deploy
# 记下打印的端口号（通常 9260，被占则自动换）
```

`make ps` 看到所有容器 `healthy` 就算 OK。

---

## 1Panel（https://1panel.cn）

### 1. 添加网站 → 反向代理

面板 → **网站** → **创建网站** → 选 **反向代理** 类型

### 2. 填 3 个字段

| 字段 | 值 |
|---|---|
| **主域名** | `blog.yoursite.com`（填你自己的域名） |
| **代号** | `utterlog`（随便填，用于识别） |
| **代理地址** | `http://127.0.0.1:9260`（把 9260 换成 `make deploy` 打印的实际端口） |

点**创建**。

### 3. 申请 SSL 证书

新建的网站 → **配置** → **HTTPS** → **Let's Encrypt** → 申请。

1Panel 自动处理域名验证和续签。

### 4. 验证

浏览器打开 `https://blog.yoursite.com` → 看到 Utterlog 安装向导。

---

## 宝塔面板（https://bt.cn）

### 1. 添加站点 → 反向代理

**网站** → **添加站点** → 只填域名，不用选 PHP / 数据库。

站点建好后进**设置** → **反向代理** → **添加反向代理**。

### 2. 填字段

| 字段 | 值 |
|---|---|
| **代理名称** | `utterlog` |
| **目标 URL** | `http://127.0.0.1:9260`（换成实际端口） |
| **发送域名** | `$host`（保持默认） |

提交。

### 3. SSL

站点 **设置** → **SSL** → **Let's Encrypt** → 勾上 **强制 HTTPS**。

### 4. 关键：加 WebSocket 支持

反向代理有时不默认转发 WebSocket。站点 → **设置** → **配置文件** →
在 `location / {` 块里加：

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

（用于 AI 流式输出、在线用户实时推送）

保存，重启 nginx。

---

## AAPanel

流程跟宝塔几乎一样（AAPanel 是宝塔的国际版），照上面宝塔步骤来。

---

## 常见坑

### "502 Bad Gateway"
说明 Utterlog 没跑起来 或 端口填错了。
```bash
make ps              # 看容器状态
make logs-app        # 看错误日志
cat .env | grep UTTERLOG_PORT   # 确认端口
```

### SSL 申请失败
通常是 DNS 没指向 VPS IP。确认：
```bash
dig +short blog.yoursite.com     # 返回应为 VPS 公网 IP
```
DNS 记录修好后重新申请。

### AI 流式输出卡顿 / 不实时
反代层缓冲了响应。nginx 里加：
```nginx
proxy_buffering off;
proxy_read_timeout 300s;
```

### /admin 后台能打开但博客 404
说明 Bun app 的 `WEB_PROXY_TARGET` 没生效（没反代到 Next.js）。
检查：
```bash
docker compose -f docker-compose.prod.yml logs app | grep "Bun app"
# 应看到 Bun app 启动日志；WEB_PROXY_TARGET 默认为 http://127.0.0.1:3000
```

重启 app：
```bash
docker compose -f docker-compose.prod.yml restart app
```
