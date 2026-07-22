SERVICE ?= utterlog-app

.PHONY: help deploy update build check test verify dev logs status ps start stop restart deploy-utterlog deploy-utterlog-dry schema

help:
	@echo ""
	@echo "  Utterlog — Bun + systemd"
	@echo ""
	@echo "    make deploy              初次部署或重新配置主机"
	@echo "    make update              拉取源码、校验、构建并重启服务"
	@echo "    make build               构建后台和 TanStack Start"
	@echo "    make check               TypeScript 检查"
	@echo "    make test                服务端测试"
	@echo "    make verify              完整校验"
	@echo "    make dev                 本地 Bun 开发服务"
	@echo "    make logs                跟踪 systemd 日志"
	@echo "    make status              查看服务状态"
	@echo "    make start|stop|restart  管理 systemd 服务"
	@echo "    make deploy-utterlog     通过 SSH 同步到已配置的服务器"
	@echo "    make schema              导出数据库 schema"
	@echo ""

deploy:
	@bash scripts/deploy.sh

update:
	@sudo bash scripts/update-bun.sh

build:
	@bun run build

check:
	@bun run check

test:
	@bun run test:server

verify:
	@bun run verify

dev:
	@bun run dev

logs:
	@journalctl -u "$(SERVICE)" -f

status ps:
	@systemctl status "$(SERVICE)" --no-pager

start:
	@sudo systemctl start "$(SERVICE)"

stop:
	@sudo systemctl stop "$(SERVICE)"

restart:
	@sudo systemctl restart "$(SERVICE)"

deploy-utterlog:
	@bash scripts/deploy-utterlog-bun.sh

deploy-utterlog-dry:
	@bash scripts/deploy-utterlog-bun.sh --dry-run

schema:
	@bash scripts/dump-schema.sh
