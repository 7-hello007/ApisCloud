# 一、阶段 1.1 工程初始化 · 经验总结

## 1. 完成了什么

阶段 1.1 结束时，项目具备以下能力：

| 类别 | 产出 |
|---|---|
| Monorepo | pnpm workspace，6 个子包可被引用 |
| 语言与规范 | TypeScript 5.9.3、ESLint 8、Prettier 3、EditorConfig |
| 测试 | Jest 29 + ts-jest，4 个冒烟测试全绿 |
| 构建 | `tsc -b` 项目引用构建，6 个子包输出 CJS |
| 命令入口 | Makefile 统一 lint / typecheck / test / build-registry |
| 环境变量 | `.env.example` + `.env`，覆盖总线、PG、Redis、MQTT、Kafka、监控、安全 |
| 目录骨架 | core / shared / plugins / web / monitor / docs / tests / deploy / scripts |
| 包骨架 | libs、message-bus、contracts、types、layer-config、plugin-host |
| 注册表脚本 | `scripts/build-registry.js` 可扫描生成 `registry.json` |
| Git | `.gitignore` 排除 dist、node_modules、`.env`、`registry.json`，首次提交完成 |

## 2. 怎么完成的

按这个顺序推进：

1. **建目录骨架**：一次 `mkdir -p` 建全 core / shared / plugins / web / monitor / docs / tests / scripts。
2. **建根配置**：`package.json`、`pnpm-workspace.yaml`、`.gitignore`、`.editorconfig`、`.env.example`。
3. **配 TS**：`tsconfig.base.json`（共享配置）+ 根 `tsconfig.json`（项目引用）+ 每个子包的 `tsconfig.json`。
4. **配代码规范**：`.eslintrc.json`、`.eslintignore`、`.prettierrc`、`.prettierignore`。
5. **配 Jest**：`jest.config.js` + `tests/setup.js` + `tests/README.md`。
6. **建 Makefile**：统一命令入口。
7. **建 6 个子包**：每个子包 `package.json` + `tsconfig.json` + 至少一个 `index.ts`。
8. **写冒烟测试**：`tests/smoke.init.test.ts` 验证 6 个包能被引用。
9. **建 registry 脚本**：`scripts/build-registry.js` 占位。
10. **安装依赖、验证、提交**。

## 3. 遇到了什么问题

阶段 1.1 一共踩了 6 个坑：

| # | 问题 | 表现 |
|---|---|---|
| 1 | TS 报“找不到任何输入” | `include: ["src/**/*"]` 匹配不到文件，因为 `src/index.ts` 还没建 |
| 2 | TS 报 `baseUrl`、`moduleResolution=node10` 弃用 | TS 5.9 对旧解析选项发出弃用警告 |
| 3 | TS 报 `@apiscloud/*` 找不到 | `paths` 只列了 5 个包，漏了 `@apiscloud/plugin-host` |
| 4 | TS 报 `describe` / `it` / `expect` 未定义 | tsconfig 没加 `types: ["node","jest"]` |
| 5 | CLI 报 TS5103 `ignoreDeprecations` 非法值 | TS 5.9 只接受 `"5.0"`，不接受 `"6.0"` |
| 6 | Jest 报 `Unexpected token 'export'` | `tsc -b` 把 dist 编译成 ESM，Jest 按 CJS 加载失败 |
| 7 | ESLint 警告 TS 5.9 不被支持 | `@typescript-eslint` 7.x 只支持 TS < 5.6 |
| 8 | `make build-registry` 报 MODULE_NOT_FOUND | `scripts/build-registry.js` 还没创建 |

## 4. 怎么解决的

| # | 解决方案 |
|---|---|
| 1 | 给每个子包补上 `src/index.ts` / `index.ts`，导出至少一个常量 |
| 2 | `ignoreDeprecations: "5.0"` 静音；或直接删掉该选项 |
| 3 | 在 `tsconfig.base.json` 的 `paths` 里补 `@apiscloud/plugin-host` 两条映射 |
| 4 | `compilerOptions.types: ["node", "jest"]`，并确保 `@types/jest` 已安装 |
| 5 | `"6.0"` 改 `"5.0"`，或删掉这一行 |
| 6 | `module` 改回 `CommonJS`，`moduleResolution` 改回 `Node10`，删 dist 和 tsbuildinfo 重编 |
| 7 | `@typescript-eslint/*` 升级到 `^8.0.0` |
| 8 | 创建 `scripts/build-registry.js`，`chmod +x`，加进 Makefile |

## 5. 关键经验

1. **tsconfig 的 `paths` 只对 base 里列出的别名生效**，新包一定要同步加进去，Jest 和 tsc 两边都要配。
2. **Jest 的模块解析走两套**：`moduleNameMapper` 和 ts-jest 的 `tsconfig`。只配一套不够，两套都要配。
3. **ts-jest 默认找不到带 `references` 的根 tsconfig**，要显式在 `transform` 里指定 `tsconfig: '<rootDir>/tsconfig.base.json'`。
4. **开发阶段统一用 CommonJS**。ESM 是以后发布 npm 包或跑 Node ESM 时的事，现在切 ESM 会引入一堆额外配置。
5. **`ignoreDeprecations` 版本敏感**。TS 5.9 用 `"5.0"`，TS 6.x 用 `"6.0"`，写错就报 TS5103。
6. **空目录 Git 不跟踪**，需要 `.gitkeep`。`registry.json` 是产物，进 `.gitignore`。
7. **`@typescript-eslint` 和 TS 版本要匹配**。TS 5.9 要配 `@typescript-eslint` 8.x。

## 6. 阶段 1.1 验收清单

- [x] `pnpm install` 成功
- [x] `make lint` 无 TS 版本警告
- [x] `make typecheck` 通过
- [x] `make test-unit` 4 个冒烟测试全绿
- [x] `make build-registry` 生成 `core/registry/registry.json`
- [x] 6 个子包可被 `@apiscloud/*` 引用
- [x] Makefile 命令可用
- [x] Git 首次提交完成

---

# 二、阶段一 · 全部任务回顾

以下是原始计划书里的阶段一任务表，原样保留：

## 阶段一：基础设施与共享库

**阶段目标：** 搭建所有服务共用的底层设施，确保后续开发有统一依赖。

**实现思路：**

- 用 Docker Compose 编排 Kafka、PostgreSQL、EMQX、Redis、Prometheus、Grafana、Loki。
- 编写共享库，封装 MQTT、PG、Redis、日志、配置、健康检查。
- 编写消息总线抽象层，支持 MQTT/Kafka/Memory 适配器。
- 编写层配置，先声明单层结构，预留多层。
- 编写插件宿主，支持进程内扩展。
- 建立 registry 目录，准备预生成机制。
- 建立 docs 和 tests 目录，规范落地。
- 建立 GitHub Actions 配置，支持自动测试、自动构建。
- 编写安全性基础：认证、输入验证、密钥管理。

**具体任务：**

| 序号 | 任务 | 怎么完成 | 产出 |
|---|---|---|---|
| 1.1 | 编写基础设施编排 | Docker Compose 定义所有基础设施 | docker-compose.infra.yml |
| 1.2 | 编写数据库初始化 | SQL 建表：车辆表、遥测表、告警表 | init.sql |
| 1.3 | 编写共享库 | 逐个封装：mqtt/pg/redis/logger/config/health | core/libs/ |
| 1.4 | 编写消息总线抽象层 | 统一接口 + MQTT/Kafka/Memory 适配器 | shared/message-bus/ |
| 1.5 | 编写层配置 | layers.yml 声明单层，预留多层 | shared/layer-config/layers.yml |
| 1.6 | 编写插件宿主 | 加载、注册、生命周期、异常保护 | core/plugin-host/ |
| 1.7 | 编写可观测性服务 | Prometheus + Loki | core/services/observability/ |
| 1.8 | 编写 CI 配置 | GitHub Actions | .github/workflows/ci.yml |
| 1.9 | 建立 registry | 创建目录和占位文件 | core/registry/ |
| 1.10 | 建立 docs | 创建目录和 README | docs/ |
| 1.11 | 建立 tests | 创建目录和配置 | tests/ |
| 1.12 | 编写安全基础 | 认证、输入验证、密钥管理 | security.V1.md |
| 1.13 | 编写文档 | 每个功能一个文档 | infra.V1.md 等 |

**阶段验收：** 基础设施可一键启动，共享库可被引用，消息总线可切换，层配置可加载，插件宿主可加载插件，可观测性可用，CI 可运行。

**阶段文档：**

- `docs/architecture.V1.md`
- `docs/infra.V1.md`
- `docs/messageBus.V1.md`
- `docs/layerConfig.V1.md`
- `docs/pluginHost.V1.md`
- `docs/observability.V1.md`
- `docs/security.V1.md`
- `docs/cicd.V1.md`

---

## 任务进度对照

原始 13 项任务与当前实际进度的对应关系：

| 序号 | 任务 | 状态 | 说明 |
|---|---|---|---|
| 前置 | 工程初始化 | ✅ 已完成 | 我实际展开时新增的步骤，对应原任务的 1.9/1.10/1.11 的目录与骨架 |
| 1.1 | 编写基础设施编排 | ⬜ 未开始 | 下一步就做这个 |
| 1.2 | 编写数据库初始化 | ⬜ 未开始 | 跟 1.1 一起做 |
| 1.3 | 编写共享库 | ⬜ 未开始 | 只有 `index.ts` 占位 |
| 1.4 | 编写消息总线抽象层 | ⬜ 未开始 | 只有 `index.ts` 占位 |
| 1.5 | 编写层配置 | 🟡 部分完成 | `layers.yml` 已建，loader / schema 未做 |
| 1.6 | 编写插件宿主 | ⬜ 未开始 | 只有 `index.ts` 占位 |
| 1.7 | 编写可观测性服务 | ⬜ 未开始 | 目录已建，服务未做 |
| 1.8 | 编写 CI 配置 | ⬜ 未开始 | `.github/workflows/` 目录已建 |
| 1.9 | 建立 registry | 🟡 部分完成 | 目录、`.gitkeep`、`build-registry.js` 已建，扫描逻辑已有骨架 |
| 1.10 | 建立 docs | ⬜ 未开始 | 目录已建，文档未写 |
| 1.11 | 建立 tests | ✅ 已完成 | `jest.config.js`、`setup.js`、`README.md`、冒烟测试已建 |
| 1.12 | 编写安全基础 | ⬜ 未开始 | 未做 |
| 1.13 | 编写文档 | ⬜ 未开始 | 未做 |

---

## 下一步

原始任务 1.1、1.2 是同一批做：**基础设施编排 + 数据库初始化**。

具体做：

- 写 `docker-compose.infra.yml`：PG、Redis、EMQX、Kafka、Prometheus、Grafana、Loki。
- 写 `deploy/postgres/init.sql`：车辆表、遥测表、告警表。
- 配 `monitor/prometheus/prometheus.yml`、`monitor/loki/loki-config.yml`、`monitor/grafana/provisioning/`。
- 挂载到 PG 容器 `/docker-entrypoint-initdb.d/`。
- 给 `Makefile` 加 `infra-up` / `infra-down` / `infra-logs`。
- 验收：`make infra-up` 后所有容器 healthy。