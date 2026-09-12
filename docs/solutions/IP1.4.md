# 一、阶段 1.4 消息总线抽象层 · 经验总结

## 1. 完成了什么

阶段 1.4 结束时，`shared/message-bus` 具备以下能力：

| 模块 | 文件 | 能力 |
|---|---|---|
| topics | `topics.ts` | 定义 4 个主题常量：`telemetry.raw`、`telemetry.aggregated`、`events.commands`、`events.alerts` |
| envelope | `envelope.ts` | 统一消息信封，zod schema、创建、校验、序列化、反序列化 |
| interface | `interface.ts` | 统一 `MessageBus` 接口：connect / publish / subscribe / commit / health / close |
| memory | `adapters/memory.ts` | 内存适配器，测试和演示用，支持 filter、多订阅者、unsubscribe |
| mqtt | `adapters/mqtt.ts` | MQTT 适配器，复用 `@apiscloud/libs` 的 mqtt 封装，支持 filter |
| kafka | `adapters/kafka.ts` | Kafka 适配器，支持消费者组、分区键、自动提交位点 |
| factory | `factory.ts` | 按 `MESSAGE_BUS` 配置创建实例，exhaustive 检查 |
| index | `index.ts` | 统一出口 |

配套：

- 依赖装好：kafkajs、uuid、zod、@apiscloud/libs
- 3 个新测试文件：envelope、memory、switch
- 单元测试从 5 个 suite 增加到 8 个 suite

## 2. 怎么完成的

按这个顺序推进：

1. **装依赖**：`pnpm add kafkajs uuid zod`，`pnpm add -D @types/uuid`，`pnpm add @apiscloud/libs@workspace:*`。
2. **建目录**：`shared/message-bus/adapters`。
3. **写 topics**：常量定义 4 个主题，`ALL_TOPICS` 数组。
4. **写 envelope**：zod schema + `createEnvelope` + `validateEnvelope` + `parseEnvelope` + `serializeEnvelope`，`trace_id`、`span_id` 未提供时自动生成。
5. **写 interface**：定义 `MessageBus` 接口、`SubscribeOptions`、`PublishOptions`、`Subscription`、`MessageHandler`。
6. **写 memory 适配器**：Map 存订阅，publish 时遍历调用 handler，支持 filter。
7. **写 mqtt 适配器**：复用 libs 的 mqtt 封装，把 Envelope 序列化为 Buffer 发布，订阅后反序列化。
8. **写 kafka 适配器**：`kafkajs` 的 producer/consumer，支持 groupId、partitionKey，`eachMessage` 自动提交。
9. **写 factory**：`switch (config.MESSAGE_BUS)` 三种分支，用 `never` 做 exhaustive 检查。
10. **统一出口**：`index.ts` 导出所有模块和类型。
11. **写测试**：envelope（5 个测试）、memory（6 个测试）、switch（3 个测试）。
12. **清缓存重编**：`find . -name "*.tsbuildinfo" ... -delete`，再 `pnpm typecheck`。

## 3. 遇到了什么问题

阶段 1.4 一共踩了 5 个坑：

| # | 问题 | 表现 |
|---|---|---|
| 1 | 跨项目 rootDir 报错 | TS6059、TS6307：`core/libs/src/*` 不在 message-bus 的 rootDir 下 |
| 2 | message-bus 找不到 zod | `Cannot find module 'zod'` |
| 3 | 隐式 any | `Parameter 'i' implicitly has an 'any' type`，因为 zod 找不到，推断链断了 |
| 4 | `moduleResolution: "bundler"` 冲突 | TS5095：`bundler` 要求 `module` 是 `es2015+` 或 `preserve`，但项目用的是 `CommonJS` |
| 5 | `ignoreDeprecations` 在 VS Code 仍报警 | CLI 全绿，但 IDE 里 `moduleResolution=node10` 弃用警告不消失 |

## 4. 怎么解决的

| # | 解决方案 |
|---|---|
| 1 | 在 `shared/message-bus/tsconfig.json` 加 `references: [{ path: "../../core/libs" }]`，让 TS 用 libs 编译好的 `.d.ts` 而不是源码；同时把根 `tsconfig.json` 的 references 顺序调整为 `core/libs` 在 `message-bus` 前面 |
| 2 | `cd shared/message-bus && pnpm add zod` |
| 3 | 装完 zod，推断链恢复，隐式 any 消失 |
| 4 | 从 `core/libs/tsconfig.json` 和 `shared/message-bus/tsconfig.json` 里删掉 `"moduleResolution": "bundler"`，让它们继承 base 的 `Node10` |
| 5 | 确认这是 VS Code 内置 TS 版本（6.x）和项目 TS 版本（5.9.3）不一致导致，命令行 `pnpm typecheck` 全绿就是验收标准，IDE 的差异不作为阻塞。可选方案是在 VS Code 里 `TypeScript: Select TypeScript Version` → `Use Workspace Version` |

## 5. 关键经验

1. **项目引用（project references）是 monorepo 的标配**。跨包引用必须在 `tsconfig.json` 的 `references` 里声明，否则 TS 会把依赖包的源码拉进来，触发 TS6059/TS6307。
2. **references 顺序决定构建顺序**。被依赖的包排在前面。
3. **`paths` 和 `references` 二选一，不能混用**。`paths` 让 TS 跳源码，`references` 让 TS 用编译产物。同时存在会冲突。
4. **`moduleResolution: "bundler"` 需要 `module` 是 ESM**。CommonJS 项目只能用 `Node10` 或 `NodeNext`。
5. **`ignoreDeprecations` 版本敏感**。TS 5.9 用 `"5.0"`，TS 6.x 用 `"6.0"`，写错就报 TS5103。
6. **VS Code 的 TS 版本和项目 TS 版本可能不同**。IDE 报错但 CLI 通过时，先 `pnpm tsc --version` 确认项目版本，再看 VS Code 状态栏的版本，不一致就切换。
7. **CLI 是权威**。`pnpm typecheck`、`pnpm test:unit`、`pnpm build` 全绿就是验收标准。
8. **适配器的 `this` 要用闭包捕获**。`unsubscribe` 里如果直接用 `this.client`，会丢 this。用 `const client = this.client` 在闭包外捕获。
9. **`kafkajs` 的 `eachMessage` 自动提交位点**。想手动提交得用 `eachBatch` + `autoCommit: false`，当前阶段不需要。
10. **envelope 自动生成 `trace_id`/`span_id`**。这是为未来全链路追踪预留的，现在不接 Jaeger，但格式已经就位。

## 6. 阶段 1.4 验收清单

- [x] `shared/message-bus` 依赖装好：kafkajs、uuid、zod、@apiscloud/libs
- [x] `topics.ts` 定义 4 个主题
- [x] `envelope.ts` 定义信封 schema、创建、校验、序列化
- [x] `interface.ts` 定义 `MessageBus` 统一接口
- [x] `adapters/memory.ts` 实现内存适配器
- [x] `adapters/mqtt.ts` 实现 MQTT 适配器
- [x] `adapters/kafka.ts` 实现 Kafka 适配器
- [x] `factory.ts` 按配置创建实例
- [x] `index.ts` 统一出口
- [x] `pnpm typecheck` 通过
- [x] `pnpm test:unit` 8 个 suite 全绿
- [x] `pnpm build` 生成 dist 产物
- [x] `MESSAGE_BUS=memory/mqtt/kafka` 三种配置都能创建对应实例

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
| 1.1 | 编写基础设施编排 | ✅ 已完成 | `docker-compose.infra.yml` 一键启动 7 个服务，全部 healthy |
| 1.2 | 编写数据库初始化 | ✅ 已完成 | `deploy/postgres/init.sql` 建 4 张表 + 1 视图，PG 首次启动自动执行 |
| 1.3 | 编写共享库 | ✅ 已完成 | `core/libs` 8 个模块，19 个单元测试全绿 |
| 1.4 | 编写消息总线抽象层 | ✅ 已完成 | `shared/message-bus` 3 个适配器 + 8 个测试 suite 全绿 |
| 1.5 | 编写层配置 | 🟡 部分完成 | `layers.yml` 已建，loader / schema 未做 |
| 1.6 | 编写插件宿主 | ⬜ 未开始 | 只有 `index.ts` 占位 |
| 1.7 | 编写可观测性服务 | 🟡 部分完成 | 基础设施侧 Prometheus/Loki/Grafana 已就位，应用侧 observability 服务未做 |
| 1.8 | 编写 CI 配置 | ⬜ 未开始 | `.github/workflows/` 目录已建 |
| 1.9 | 建立 registry | 🟡 部分完成 | 目录、`.gitkeep`、`build-registry.js` 已建，扫描逻辑有骨架 |
| 1.10 | 建立 docs | ⬜ 未开始 | 目录已建，文档未写 |
| 1.11 | 建立 tests | ✅ 已完成 | `jest.config.js`、`setup.js`、`README.md`、冒烟测试已建 |
| 1.12 | 编写安全基础 | 🟡 部分完成 | security 模块在 libs 里已做，独立文档未写 |
| 1.13 | 编写文档 | ⬜ 未开始 | 未做 |

---

## 下一步

原始任务 **1.5 是：编写层配置**。

具体做：

- `shared/layer-config/layers.yml`：声明单层结构，预留多层。
- `shared/layer-config/schema.ts`：zod schema 校验层配置。
- `shared/layer-config/loader.ts`：读取 `layers.yml`，提供 `getLayers()`、`getServices(layerName)`。
- `shared/layer-config/index.ts`：统一出口。
- 测试：`layerConfig.load.test.ts`、`layerConfig.addLayer.test.ts`。

需要我继续讲 **阶段 1.5：编写层配置**吗？