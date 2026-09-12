# 一、阶段 1.3 共享库 · 经验总结

## 1. 完成了什么

阶段 1.3 结束时，`core/libs` 具备以下能力：

| 模块 | 文件 | 能力 |
|---|---|---|
| config | `src/config/schema.ts`、`src/config/index.ts` | dotenv 读环境变量 + zod 校验，缺关键字段启动即失败，带缓存 |
| logger | `src/logger/types.ts`、`src/logger/index.ts` | pino JSON 日志，统一带 `service`、`layer`、`trace_id`、`span_id` |
| health | `src/health/types.ts`、`src/health/index.ts` | 注册检查项，聚合 `ok/degraded/down`，可暴露 HTTP handler |
| pg | `src/pg/index.ts` | 连接池、`query`、`transaction`、`health`、`close`、`raw` |
| redis | `src/redis/index.ts` | ioredis 封装，`get/set/del/hset/hget/hgetall/publish/subscribe/health` |
| mqtt | `src/mqtt/index.ts` | mqtt.js 封装，`publish/subscribe/health/close/raw`，自动重连 |
| metrics | `src/metrics/index.ts` | prom-client，`counter/gauge/histogram`，默认标签 `service` |
| security | `src/security/index.ts` | JWT 签发/验证、zod 输入校验 |
| 统一出口 | `src/index.ts` | 所有模块可 `import from '@apiscloud/libs'` |

配套：

- 8 个运行时依赖装到 `core/libs`：pino、pino-pretty、pg、ioredis、mqtt、prom-client、zod、jsonwebtoken、dotenv。
- 2 个类型依赖：@types/pg、@types/jsonwebtoken。
- 4 个新测试文件：config、health、security、metrics。
- 单元测试从 4 个增加到 19 个，5 个 suite 全绿。

## 2. 怎么完成的

按这个顺序推进：

1. **装依赖**：`pnpm add pino pino-pretty pg ioredis mqtt prom-client zod jsonwebtoken dotenv`，加 `@types/pg @types/jsonwebtoken`。
2. **建目录**：config、logger、health、pg、redis、mqtt、metrics、security 八个子目录。
3. **写 config**：`schema.ts` 用 zod 定义环境变量契约；`index.ts` 做 `loadConfig` + `resetConfig` + 缓存。
4. **写 logger**：`types.ts` 定义 `LogContext` / `LoggerOptions`；`index.ts` 用 pino 生成 logger，`withContext` 绑 child 上下文。
5. **写 health**：`types.ts` 定义 `HealthState`、`HealthCheckResult`、`HealthReport`；`index.ts` 实现 `HealthRegistry`，注册检查、并发执行、聚合状态、提供 HTTP handler。
6. **写 pg**：`pg.Pool` 连接池，封装 `query`、`transaction`、`health`、`close`、`raw`，`pool.on('error')` 防崩。
7. **写 redis**：`ioredis` 客户端，封装常用命令，`subscribe` 用 duplicate 连接，`health` 检查 PING。
8. **写 mqtt**：`mqtt.connect` 客户端，封装 `publish`、`subscribe`、`health`、`close`、`raw`，设置重连和 keepalive。
9. **写 metrics**：`prom-client` Registry + `collectDefaultMetrics` + `setDefaultLabels`，封装 counter/gauge/histogram。
10. **写 security**：`jsonwebtoken` 签发/验证 + zod 输入校验。
11. **统一出口**：`src/index.ts` 导出全部模块和类型。
12. **写测试**：config、health、security、metrics 四个测试文件，覆盖正常路径和错误路径。
13. **跑测试**：`pnpm typecheck` + `pnpm test:unit`。

## 3. 遇到了什么问题

阶段 1.3 一共踩了 2 个坑：

| # | 问题 | 表现 |
|---|---|---|
| 1 | metrics 测试断言不匹配 | `expect(text).toContain('test_gauge 42')` 失败，实际输出是 `test_gauge{service="test-svc"} 42` |
| 2 | dotenv 17.x 输出噪声 | 测试日志里出现大量 `◇ injected env (29) from .env` 提示，干扰测试输出 |

## 4. 怎么解决的

| # | 解决方案 |
|---|---|
| 1 | 把断言改成 `expect(text).toContain('test_gauge{service="test-svc"} 42')`，因为 prom-client 的 `setDefaultLabels({ service })` 会给所有指标加 `service` 标签 |
| 2 | 在 `core/libs/src/config/index.ts` 里把 `dotenv.config()` 改成 `dotenv.config({ quiet: true })`，或设 `process.env.DOTENV_CONFIG_QUIET = 'true'` |

## 5. 关键经验

1. **prom-client 的 `setDefaultLabels` 会给所有指标加标签**，写测试断言时要带上 `{service="..."}`，否则永远匹配不上。
2. **dotenv 17.x 默认会打印提示**，通过 `{ quiet: true }` 或环境变量 `DOTENV_CONFIG_QUIET=true` 关掉。
3. **config 缓存必须提供 `resetConfig()`**，否则测试之间会互相污染。
4. **`pg.Pool` 要监听 `error` 事件**，空闲连接错误不能让它崩进程。
5. **`ioredis` 的 `subscribe` 要 duplicate 连接**，因为进入订阅模式的连接不能再执行普通命令。
6. **`mqtt.subscribe` 后监听 `message` 事件要过滤 topic**，避免多个订阅互相干扰。
7. **`jsonwebtoken` 的 `expiresIn` 类型要断言**，TypeScript 5.9 + @types/jsonwebtoken 对 `string` 类型有严格约束，用 `as jwt.SignOptions` 处理。
8. **health 模块设计成注册式**，各服务注册自己的检查项，比硬编码灵活。

## 6. 阶段 1.3 验收清单

- [x] `core/libs` 依赖装好：pino、pg、ioredis、mqtt、prom-client、zod、jsonwebtoken、dotenv
- [x] config 模块可加载，zod 校验生效
- [x] logger 模块可创建 logger，带 service、layer 字段
- [x] health 模块可注册检查、聚合状态
- [x] pg 模块可创建连接池
- [x] redis 模块可创建客户端
- [x] mqtt 模块可创建客户端
- [x] metrics 模块可创建 registry，注册 counter/gauge/histogram
- [x] security 模块可签发/验证 JWT，可做 zod 输入校验
- [x] `@apiscloud/libs` 统一出口导出所有模块
- [x] `pnpm typecheck` 通过
- [x] `pnpm test:unit` 5 个 suite、19 个测试全绿
- [x] `pnpm build` 生成 dist 产物

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
| 1.4 | 编写消息总线抽象层 | ⬜ 未开始 | 只有 `index.ts` 占位 |
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

原始任务 **1.4 是：编写消息总线抽象层**。

具体做：

- `shared/message-bus/interface.ts`：定义 `MessageBus` 统一接口。
- `shared/message-bus/envelope.ts`：统一消息信封，含 `trace_id`、`span_id`、`version`。
- `shared/message-bus/topics.ts`：主题常量：`telemetry.raw`、`telemetry.aggregated`、`events.commands`、`events.alerts`。
- `shared/message-bus/adapters/memory.ts`：内存适配器（测试用）。
- `shared/message-bus/adapters/mqtt.ts`：MQTT 适配器，复用 `@apiscloud/libs` 的 mqtt 封装。
- `shared/message-bus/adapters/kafka.ts`：Kafka 适配器，用 `kafkajs`。
- `shared/message-bus/factory.ts`：按 `MESSAGE_BUS` 配置创建实例。
- `shared/message-bus/index.ts`：统一出口。
- 测试：memory 适配器、切换测试、envelope 校验。
