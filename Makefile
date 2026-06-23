# ============================================================
# Utterlog — 你只需要两条命令:
#   make deploy    初次部署
#   make update    每次更新
# 其他是高级选项, 请用 make help-advanced 查看
# ============================================================

.PHONY: help
help:
	@echo ""
	@echo "  \033[1;36mUtterlog\033[0m — 你只需要这两条命令:"
	@echo ""
	@echo "    \033[1;32mmake deploy\033[0m         初次部署 (自动检测内存 / 生成密码 / 找空闲端口)"
	@echo "    \033[1;32mmake update\033[0m         拉最新代码重新部署"
	@echo ""
	@echo "  常用辅助:"
	@echo "    make logs           看日志"
	@echo "    make ps             看容器状态"
	@echo "    make stop           停止"
	@echo ""
	@echo "  高级选项 (特殊场景):"
	@echo "    make help-advanced"
	@echo ""

.PHONY: help-advanced
help-advanced:
	@echo ""
	@echo "  \033[1mUtterlog 高级命令:\033[0m"
	@echo ""
	@echo "  \033[1m部署变种:\033[0m"
	@echo "    make deploy-tls          内置 Caddy + 自动 TLS (需 DOMAIN=your.site)"
	@echo "    make deploy-interactive  提示输入密码 (默认自动生成)"
	@echo "    make deploy-pull         强制用 ghcr.io 预构建镜像"
	@echo "    make deploy-build        强制本地构建镜像"
	@echo "    make deploy-fast         重启容器, 跳过构建"
	@echo ""
	@echo "  \033[1m生命周期:\033[0m"
	@echo "    make logs-app            只看 Bun app 日志"
	@echo "    make down                停止并删除容器 (保留数据)"
	@echo "    make clean               删除容器 + 数据 (需确认)"
	@echo ""
	@echo "  \033[1m开发:\033[0m"
	@echo "    make dev                 开发模式 (dev Dockerfile + hot reload)"
	@echo "    make schema              导出当前 DB schema 到 app/server/assets/schema.sql"
	@echo ""

# --- Main commands ---

.PHONY: deploy
deploy:
	@bash scripts/deploy.sh

.PHONY: update
update:
	@echo "==> Pulling latest code ..."
	@git pull --ff-only || { echo "git pull failed; resolve manually then re-run 'make update'"; exit 1; }
	@bash scripts/deploy.sh

# --- Advanced commands ---

.PHONY: deploy-tls
deploy-tls:
	@bash scripts/deploy.sh --tls

.PHONY: deploy-interactive
deploy-interactive:
	@bash scripts/deploy.sh --interactive

.PHONY: deploy-pull
deploy-pull:
	@bash scripts/deploy.sh --pull

.PHONY: deploy-build
deploy-build:
	@bash scripts/deploy.sh --build

.PHONY: deploy-fast
deploy-fast:
	@bash scripts/deploy.sh --no-build

# --- Lifecycle ---

.PHONY: logs
logs:
	docker compose -f docker-compose.prod.yml logs -f

.PHONY: logs-app
logs-app:
	docker compose -f docker-compose.prod.yml logs -f app

.PHONY: ps
ps:
	docker compose -f docker-compose.prod.yml ps

.PHONY: stop
stop:
	docker compose -f docker-compose.prod.yml stop

.PHONY: down
down:
	docker compose -f docker-compose.prod.yml down

.PHONY: clean
clean:
	@echo "This will DELETE the database and all uploads!"
	@read -p "Type 'yes' to confirm: " c && [ "$$c" = "yes" ] || exit 1
	docker compose -f docker-compose.prod.yml down -v

# --- Development ---

.PHONY: dev
dev:
	docker compose up -d --build

.PHONY: dev-local
dev-local:
	bun run server:dev

.PHONY: schema
schema:
	@bash scripts/dump-schema.sh
