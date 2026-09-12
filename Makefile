.PHONY: help install lint format typecheck test test-unit test-integration test-e2e test-coverage build clean \
        infra-up infra-down infra-logs infra-ps infra-reset build-registry

help:
	@echo "可用命令："
	@echo "  make install            安装依赖"
	@echo "  make lint               代码检查"
	@echo "  make format             格式化"
	@echo "  make typecheck          类型检查"
	@echo "  make test               全部测试"
	@echo "  make test-unit          单元测试"
	@echo "  make test-integration   集成测试"
	@echo "  make test-e2e           端到端测试"
	@echo "  make test-coverage      带覆盖率"
	@echo "  make build              构建"
	@echo "  make clean              清理"
	@echo "  make infra-up           启动基础设施"
	@echo "  make infra-down         停止基础设施（保留数据）"
	@echo "  make infra-logs         查看基础设施日志"
	@echo "  make infra-ps           查看基础设施状态"
	@echo "  make infra-reset        重置基础设施（删除数据）"
	@echo "  make build-registry     生成插件注册表"

install:
	pnpm install

lint:
	pnpm lint

format:
	pnpm format

typecheck:
	pnpm typecheck

test:
	pnpm test

test-unit:
	pnpm test:unit

test-integration:
	pnpm test:integration

test-e2e:
	pnpm test:e2e

test-coverage:
	pnpm test:coverage

build:
	pnpm build

clean:
	pnpm clean

# ==================== 基础设施 ====================

infra-up:
	docker compose -f docker-compose.infra.yml --env-file .env up -d
	@echo "等待服务健康检查..."
	@sleep 3
	@docker compose -f docker-compose.infra.yml ps

infra-down:
	docker compose -f docker-compose.infra.yml down

infra-logs:
	docker compose -f docker-compose.infra.yml logs -f --tail=100

infra-ps:
	docker compose -f docker-compose.infra.yml ps

infra-reset:
	docker compose -f docker-compose.infra.yml down -v
	@echo "已删除所有数据卷"

# ==================== Registry ====================

build-registry:
	node scripts/build-registry.js
