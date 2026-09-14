.PHONY: help install lint format typecheck test test-unit test-integration test-e2e test-coverage test-watch test-file build clean \
        start stop restart status \
        infra-up infra-down infra-logs infra-ps infra-reset \
        build-registry registry-check init-topics \
        verify-e2e verify-multi-scale

# ==================== 帮助 ====================

help:
	@echo "可用命令："
	@echo ""
	@echo "  【环境】"
	@echo "    make install            安装依赖"
	@echo "    make build              构建所有包"
	@echo "    make clean              清理"
	@echo ""
	@echo "  【开发】"
	@echo "    make start              一键启动（默认 PROFILE=core）"
	@echo "    make start PROFILE=full 启动 full profile"
	@echo "    make start LAYERS=multi 启动多层"
	@echo "    make stop               停止后端和前端（保留基础设施）"
	@echo "    make restart            重启"
	@echo "    make status             查看服务状态"
	@echo ""
	@echo "  【测试】"
	@echo "    make test               全部测试"
	@echo "    make test-unit          单元测试"
	@echo "    make test-integration   集成测试"
	@echo "    make test-e2e           端到端测试"
	@echo "    make test-coverage      带覆盖率"
	@echo "    make test-watch         监听模式"
	@echo "    make test-file          跑单个文件（FILE=path）"
	@echo ""
	@echo "  【代码质量】"
	@echo "    make lint               代码检查"
	@echo "    make format             格式化"
	@echo "    make typecheck          类型检查"
	@echo ""
	@echo "  【基础设施】"
	@echo "    make infra-up           启动基础设施"
	@echo "    make infra-down         停止基础设施（保留数据）"
	@echo "    make infra-logs         查看日志"
	@echo "    make infra-ps           查看状态"
	@echo "    make infra-reset        重置（删数据）"
	@echo ""
	@echo "  【Registry】"
	@echo "    make build-registry     生成插件注册表"
	@echo "    make registry-check     生成并校验"
	@echo "    make init-topics        初始化 Kafka 主题"
	@echo ""
	@echo "  【验证】"
	@echo "    make verify-e2e         真实基础设施端到端验证"
	@echo "    make verify-multi-scale 多规模验证"

# ==================== 安装 & 构建 ====================

install:
	pnpm install

build:
	pnpm build

clean:
	pnpm clean

# ==================== 代码质量 ====================

lint:
	pnpm lint

format:
	pnpm format

typecheck:
	pnpm typecheck

# ==================== 测试 ====================

test:
	@if [ -z "$(FILTER)" ]; then \
		pnpm test; \
	else \
		pnpm exec jest --testPathPattern='$(FILTER)' --passWithNoTests; \
	fi

test-unit:
	pnpm exec jest --testPathIgnorePatterns='integration|e2e'

test-integration:
	pnpm exec jest --testPathPattern='integration' --passWithNoTests

test-e2e:
	pnpm exec jest --testPathPattern='e2e' --passWithNoTests

test-coverage:
	pnpm exec jest --coverage

test-watch:
	pnpm exec jest --watch

test-file:
	@if [ -z "$(FILE)" ]; then \
		echo "用法：make test-file FILE=tests/xxx.test.ts"; \
		exit 1; \
	fi
	pnpm exec jest $(FILE)

# ==================== 启动 & 停止 ====================

start:
	PROFILE=$(or $(PROFILE),core) LAYERS=$(or $(LAYERS),single) ./scripts/start.sh

stop:
	./scripts/dev-down.sh --keep-infra

restart: stop start

status:
	./scripts/dev-status.sh

# ==================== 基础设施 ====================

infra-up:
	@HOST_IP=$$(hostname -I | awk '{print $$1}') \
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

registry-check: build-registry
	node scripts/check-registry.js

# ==================== Kafka 主题 ====================

init-topics:
	node scripts/init-kafka-topics.js

# ==================== 验证 ====================

verify-e2e:
	./scripts/verify-e2e.sh

verify-multi-scale:
	./scripts/verify-multi-scale.sh
