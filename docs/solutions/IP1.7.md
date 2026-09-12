# 一、阶段 1.7 可观测性服务 · 经验总结

## 1. 完成了什么

阶段 1.7 结束时，`core/services/observability` 具备以下能力：

| 模块 | 文件 | 能力 |
|---|---|---|
| types | `src/types.ts` | `ObservabilityOptions`、`TracingContext`、`RequestMetrics`、`DataFlowMetrics`、`PluginMetrics` |
| metrics | `src/metrics.ts` | 9 个指标：HTTP 请求/延迟、数据流消息/延迟、插件动作/延迟、总线发布/消费/滞后 |
| health | `src/health.ts` | 健康注册中心，默认注册 `self`，支持外部注入检查 |
| logger | `src/logger.ts` | pino logger + `withTrace` + `newTraceContext`，字段含 `trace_id`、`span_id` |
| tracing | `src/tracing.ts` | `Tracer` 类，startSpan / endSpan / activeSpans |
| server | `src/server.ts` | HTTP 服务器，`/metrics` + `/health`，自动记录 HTTP 指标 |
| service | `src/service.ts` | `ObservabilityService` 组合 metrics / health / logger / tracer / server |
| index | `src/index.ts` | 统一出口 |
| server-entry | `src/server-entry.ts` | 独立进程入口，支持 SIGTERM/SIGINT 优雅关闭 |

配套：

- 依赖装好：@apiscloud/libs、pino
- 1 个新测试文件：`observability.collect.test.ts`，8 个测试
- 测试 suite 从 14 个增加到 15 个
- 根 `tsconfig.json` references 加入 observability
- `jest.config.js` 和 `tsconfig.base.json` 加入 `@apiscloud/observability` 映射

### 三层指标 + 总线指标

| 层 | 指标 |
|---|---|
| 服务层 | `apiscloud_http_requests_total`、`apiscloud_http_request_duration_seconds` |
| 数据流层 | `apiscloud_dataflow_messages_total`、`apiscloud_dataflow_latency_seconds` |
| 插件层 | `apiscloud_plugin_actions_total`、`apiscloud_plugin_action_duration_seconds` |
| 总线层 | `apiscloud_bus_published_total`、`apiscloud_bus_consumed_total`、`apiscloud_bus_consumer_lag` |

### 两个 HTTP 端点

| 端点 | 作用 |
|---|---|
| `/metrics` | Prometheus 格式，含默认指标 + 自定义指标 |
| `/health` | JSON 健康检查，down 时返回 503 |

## 2. 怎么完成的

按这个顺序推进：

1. **建包**：`core/services/observability`，`pnpm init`，改 `package.json`。
2. **装依赖**：`pnpm add @apiscloud/libs@workspace:* pino`。
3. **写 `tsconfig.json`**：`references` 只指向 `core/libs`。
4. **写 `types.ts`**：定义 5 个接口/类型。
5. **写 `metrics.ts`**：用 `createMetrics` 创建 9 个指标。
6. **写 `health.ts`**：用 `createHealthRegistry` 创建健康注册中心。
7. **写 `logger.ts`**：`createObservabilityLogger` + `withTrace` + `newTraceContext`。
8. **写 `tracing.ts`**：`Tracer` 类，startSpan / endSpan / activeSpans。
9. **写 `server.ts`**：`node:http`，两个端点 + 404 兜底，自动记录 HTTP 指标。
10. **写 `service.ts`**：`createObservabilityService` 组合所有模块。
11. **写 `index.ts`**：统一出口。
12. **写 `server-entry.ts`**：独立进程入口，注册 SIGTERM/SIGINT。
13. **写测试**：8 个测试，覆盖 `/metrics`、`/health`、额外检查、down 状态、自定义指标、404、tracer、withTrace。
14. **更新配置**：根 `tsconfig.json` references、`jest.config.js` moduleNameMapper、`tsconfig.base.json` paths。
15. **清缓存重编**：`find . -name "*.tsbuildinfo" ... -delete`，再 `pnpm typecheck`。

## 3. 遇到了什么问题

阶段 1.7 一共踩了 6 个坑：

| # | 问题 | 表现 |
|---|---|---|
| 1 | TS6196 `MetricsRegistry` 未使用 | server.ts 引了但没用 |
| 2 | TS2322 `trace_id` / `span_id` 类型不匹配 | `newTraceContext` 返回 `LogContext`，字段 optional，但 `TraceSpan` 要求必填 |
| 3 | `@apiscloud/observability` 找不到 | jest 和 tsconfig 都没加映射 |
| 4 | MQTT 客户端泄漏 | 测试跑完还在重连，报 “Cannot log after tests are done” |
| 5 | `svc.port()` 调用错误 | 接口里 `port` 是只读属性，测试里当函数调用 |
| 6 | `TracingContext` 不能赋给 `LogContext` | 前者缺 index signature |
| 7 | MQTT `close()` 报 “Cannot read properties of undefined” | 未连接时 `client.end()` 内部访问 undefined stream |
| 8 | dotenv 17.x 输出噪声 | 测试日志里大量 `◇ injected env` 提示 |

## 4. 怎么解决的

| # | 解决方案 |
|---|---|
| 1 | 删掉 server.ts 里未使用的 `MetricsRegistry` 导入 |
| 2 | `newTraceContext` 明确返回 `TracingContext`，字段必填；`randomHex(length)` 参数改为输出字符数 |
| 3 | `jest.config.js` 加 `moduleNameMapper`，`tsconfig.base.json` 加 `paths` |
| 4 | `createMqtt` 加 `manualConnect: config.NODE_ENV === 'test'` 和 `reconnectPeriod: 0`（测试环境）；`MqttAdapter.connect` 委托 wrapper 的 `connect`；switch 测试里 `await bus.close()` |
| 5 | 测试里 `svc.port()` 改成 `svc.port` |
| 6 | `TracingContext` 加 `[key: string]: unknown` |
| 7 | `close()` 用 `try/catch` 包住 `client.end()`，加 100ms 超时兜底，无论成功失败都 resolve |
| 8 | `dotenv.config({ quiet: true })` |

## 5. 关键经验

1. **`LogContext` 有 index signature，子类型也要有**。`TracingContext` 想赋给 `LogContext`，必须加 `[key: string]: unknown`。
2. **`newTraceContext` 返回类型要明确**。`LogContext` 的 `trace_id` 是 optional，`TraceSpan` 要必填，不一致就会 TS2322。
3. **`ObservabilityService` 的 `port` 是属性不是方法**。接口里 `readonly port: number`，测试里不要加 `()`。
4. **MQTT 客户端在测试环境要 `manualConnect`**。否则构造即自动连接，测试跑完还在重连，Jest 拆环境后崩。
5. **`client.end()` 在未连接时会炸**。任何状态下都 try/catch 兜底，不依赖 `connected` / `disconnected` 判断。
6. **`reconnectPeriod: 0`（测试环境）** 防止无限重连。
7. **`@apiscloud/observability` 要三处加映射**：`jest.config.js` moduleNameMapper、`tsconfig.base.json` paths、根 `tsconfig.json` references。
8. **dotenv 17.x 用 `{ quiet: true }`** 消噪声，或设 `DOTENV_CONFIG_QUIET=true`。
9. **`node:http` 手写 server 完全够用**，阶段一不引 express/fastify，减少依赖。
10. **`/metrics` 和 `/health` 两个端点足够**，Prometheus 抓前者，编排系统探后者。
11. **`Tracer` 是 OpenTelemetry 的占位**。当前只用日志字段，未来接 OTel 只改 `newTraceContext`，日志格式不变。
12. **`server-entry.ts` 注册 SIGTERM/SIGINT**，容器优雅关闭的前提。
13. **测试用 `port: 0`** 让系统分配随机端口，避免端口冲突。
14. **HTTP 请求自己记录指标**。server handler 里 `metrics.httpRequests.inc` + `metrics.httpDuration.observe`，闭环可观测。

## 6. 阶段 1.7 验收清单

- [x] `core/services/observability` 依赖装好：@apiscloud/libs、pino
- [x] `tsconfig.json` references 只指向 `core/libs`
- [x] `types.ts` 定义选项、追踪、指标类型
- [x] `metrics.ts` 创建 9 个指标
- [x] `health.ts` 创建健康注册中心
- [x] `logger.ts` pino logger + trace 上下文绑定
- [x] `tracing.ts` `Tracer` 类
- [x] `server.ts` HTTP 服务器，`/metrics` + `/health`
- [x] `service.ts` `ObservabilityService` 组合所有模块
- [x] `index.ts` 统一出口
- [x] `server-entry.ts` 独立启动入口
- [x] `pnpm typecheck` 通过
- [x] `pnpm test:unit` 15 个 suite 全绿
- [x] `pnpm build` 生成 dist

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
| 1.2 | 编写数据库初始化 | ✅ 已完成 | `deploy/postgres/init.sql` 建 4 张表 + 1 视图 |
| 1.3 | 编写共享库 | ✅ 已完成 | `core/libs` 8 个模块，19 个单元测试全绿 |
| 1.4 | 编写消息总线抽象层 | ✅ 已完成 | `shared/message-bus` 3 个适配器 + 8 个测试 suite 全绿 |
| 1.5 | 编写层配置 | ✅ 已完成 | `shared/layer-config` 单层配置 + 5 个查询函数 + 13 个新测试 |
| 1.6 | 编写插件宿主 | ✅ 已完成 | `core/plugin-host` 8 个模块 + 模板插件 + 14 个 suite 全绿 |
| 1.7 | 编写可观测性服务 | ✅ 已完成 | `core/services/observability` 9 个指标 + 2 个端点 + 15 个 suite 全绿 |
| 1.8 | 编写 CI 配置 | ⬜ 未开始 | `.github/workflows/` 目录已建 |
| 1.9 | 建立 registry | 🟡 部分完成 | 目录、`.gitkeep`、`build-registry.js` 已建，扫描逻辑有骨架 |
| 1.10 | 建立 docs | ⬜ 未开始 | 目录已建，文档未写 |
| 1.11 | 建立 tests | ✅ 已完成 | `jest.config.js`、`setup.js`、`README.md`、冒烟测试已建 |
| 1.12 | 编写安全基础 | 🟡 部分完成 | security 模块在 libs 里已做，独立文档未写 |
| 1.13 | 编写文档 | ⬜ 未开始 | 未做 |

---

## 下一步

原始任务 **1.8 是：编写 CI 配置**。

具体做：

- `.github/workflows/ci.yml`：代码检查、单元测试、集成测试、构建。
- 用 `pnpm` 做包管理，缓存 pnpm store。
- 分 job：lint、typecheck、test-unit、test-integration、build。
- 插件加载验证：CI 中验证插件能被 plugin-host 正确加载。
- 密钥扫描（gitleaks）、依赖漏洞扫描（pnpm audit / trivy）。

需要我继续讲 **阶段 1.8：编写 CI 配置**吗？