# 一、阶段 2.4 经验总结

## 1. 完成了什么

阶段 2.4 完成了 **消息总线主题的确认、测试、Kafka 主题初始化脚本、文档**，让 4 个主题在生产环境下可控。

| 类别 | 产出 | 状态 |
|---|---|---|
| 主题常量确认 | `shared/message-bus/topics.ts` 已定义 4 个主题，不改 | ✅ |
| 主题测试 | `tests/messageBus.topics.test.ts`，9 个测试 | ✅ |
| Kafka 主题初始化脚本 | `scripts/init-kafka-topics.js`，幂等创建 | ✅ |
| Makefile 命令 | `make init-topics` | ✅ |
| 文档 | `docs/messageBus.V2.md` | ✅ |
| 依赖补齐 | 根 `package.json` 加 `kafkajs` | ✅ |

**核心成果**：

**4 个主题的分区数和保留策略明确**：

| 主题 | 分区数 | 保留 | 理由 |
|---|---|---|---|
| telemetry.raw | 6 | 6h | 高频，短期保留，长期归档由 data-writer 落库 |
| telemetry.aggregated | 3 | 72h | 聚合数据，中期保留 |
| events.commands | 3 | 7d | 指令审计需要追溯 |
| events.alerts | 3 | 7d | 告警追溯 |

**主题初始化脚本特性**：
- 幂等：先 `listTopics`，只创建不存在的主题。
- 可观测：打印每个主题的分区数、保留策略、描述。
- 退出码明确：失败 `process.exit(1)`。

**文档记录**：
- 阶段二三个服务对总线的实际使用。
- MQTT topic 与总线 topic 的映射关系。
- partitionKey = vehicle_id 的设计。
- 消费者组命名规范：`apiscloud-{service}`。

## 2. 怎么完成的

**第一步：确认主题常量。**
读 `shared/message-bus/topics.ts`，确认 4 个主题已定义，命名规范统一（`<域>.<子域>`），**不改代码**。

**第二步：加主题测试。**
创建 `tests/messageBus.topics.test.ts`，9 个测试锁定主题名：
- 数量：4 个。
- 命名：符合 `<域>.<子域>` 规范。
- 4 个常量值精确匹配。
- `ALL_TOPICS` 包含且无重复。
- 域前缀分组正确。

**第三步：加 Kafka 主题初始化脚本。**
创建 `scripts/init-kafka-topics.js`：
- 定义 `TOPIC_CONFIGS` 数组，声明每个主题的分区数、副本数、保留策略、描述。
- 从 `KAFKA_BROKERS` 读 broker 地址，默认 `localhost:29092`。
- `listTopics` 查已存在主题，`createTopics` 只创建缺失的。
- `waitForLeaders: true` 确保主题就绪。
- 幂等：重复执行安全。

**第四步：Makefile 加命令。**
- `.PHONY` 加 `init-topics`。
- `init-topics` 目标调 `node scripts/init-kafka-topics.js`。

**第五步：写文档。**
创建 `docs/messageBus.V2.md`，在 V1 基础上追加：
- 4 个主题的 Kafka 配置。
- 阶段二三个服务的实际使用。
- MQTT ↔ 总线 topic 映射。
- partitionKey 设计。
- 消费者组规范。

## 3. 遇到了什么问题

### 问题一：`make init-topics` 报 `Cannot find module 'kafkajs'`

**现象：**
```
Error: Cannot find module 'kafkajs'
Require stack:
- /home/ubuntu/ApisCloud/scripts/init-kafka-topics.js
    at Module._resolveFilename (node:internal/modules/cjs/loader:1383:15)
```

**原因：**
pnpm 用严格的 `node_modules` 结构。`kafkajs` 只装在 `shared/message-bus/node_modules/` 下（因为只有 `message-bus` 包依赖它）。根目录的 `node_modules/` 没有 `kafkajs` 的软链接，所以 `scripts/init-kafka-topics.js` 从根目录 `require('kafkajs')` 找不到。

pnpm 的设计：只有显式声明依赖的包才能访问该依赖。根 `package.json` 没声明 `kafkajs`，所以根目录的脚本访问不到。

**解决：**
方案 A（推荐）：根 `package.json` 加 `kafkajs` 到 devDependencies：
```bash
pnpm add -D -w kafkajs@^2.2.4
```

- `-D`：devDependency，脚本只在开发/运维时跑。
- `-w`：workspace root，不加 pnpm 会报"当前目录不在某个包里"。
- `@^2.2.4`：和 `message-bus` 用同一版本，避免类型冲突。

方案 B（不推荐）：让脚本从 `message-bus` 包加载 `kafkajs`：
```js
const messageBusRequire = createRequire(
  path.resolve(__dirname, '..', 'shared', 'message-bus', 'package.json'),
);
const { Kafka } = messageBusRequire('kafkajs');
```
丑，且隐式耦合。

**教训：**
- pnpm workspace 里，**根目录脚本用到的依赖必须在根 `package.json` 声明**。
- 不要依赖 pnpm 提升（hoist）的隐式行为。
- pnpm 严格结构是好事：显式声明，避免幽灵依赖。

## 4. 关键经验

1. **pnpm 严格 node_modules**：只有声明依赖的包能访问。根脚本用到的依赖必须在根 `package.json`。
2. **`pnpm add -D -w`**：加 devDependency 到 workspace 根。
3. **主题脚本幂等**：先 `listTopics` 再 `createTopics`，重复执行安全。
4. **分区数按用途区分**：高频主题多分区，事件流少分区。
5. **保留策略按主题价值区分**：高频原始数据短期保留，事件数据长期保留。
6. **主题常量测试锁定契约**：防止未来误改主题名，破坏订阅关系。
7. **文档记录映射关系**：MQTT topic ↔ 总线 topic 的映射，方便排查。
8. **消费者组命名规范**：`apiscloud-{service}`，多实例自动负载均衡。
9. **`waitForLeaders: true`**：主题创建后等 leader 就绪，避免生产者立即发送失败。
10. **Kafka 自动创建主题不可控**：默认分区数和保留策略是全局值，生产环境应显式初始化。

---

# 二、阶段二任务回顾

## 阶段二总体目标

**打通"模拟车 MQTT 上报 → ingest 转发到总线 → data-writer 落 PG/Redis"的主干道。**

## 数据流

```
simulator ──MQTT──→ EMQX ──订阅──→ ingest ──发布──→ 消息总线(telemetry.raw)
                                                          │
                                                          │ 订阅
                                                          ▼
                                                   data-writer
                                                          │
                                          ┌───────────────┼───────────────┐
                                          ▼               ▼               ▼
                                     vehicle_latest  vehicle_telemetry  alerts
                                       (PG UPSERT)      (PG INSERT)    (PG INSERT)
                                          │
                                          ▼
                                       Redis 热路径
```

## 核心规则

1. **只有 Ingest 连外部（MQTT）**，simulator 通过 MQTT 上报，不直接写总线。
2. **只有 Data-Writer 连库（PG/Redis）**。
3. **服务之间零直接调用**，只通过消息总线。
4. **所有服务用 `@apiscloud/libs` 和 `@apiscloud/message-bus`**，不直接引 SDK。
5. **核心服务独立启动**，不走 plugin-host，参照 `observability/server-entry.ts`。
6. **每个服务都暴露 `/metrics` 和 `/health`**，用 `createObservabilityService`。

## 三个服务的定位

| 服务 | 角色 | 输入 | 输出 |
|---|---|---|---|
| simulator | 外部系统替身 | 内部状态机 | MQTT 上报 `telemetry/raw` |
| ingest | 唯一外部出入口 | MQTT 订阅 | 总线 `telemetry.raw`；总线订阅 → MQTT 下行 |
| data-writer | 唯一写库者 | 总线 `telemetry.raw`、`telemetry.aggregated`、`events.alerts` | PG + Redis |

## 阶段二任务清单

| 序号 | 任务 | 产出 | 状态 |
|---|---|---|---|
| 2.0 | 根配置改动 | `tsconfig.base.json`、`tsconfig.json`、`jest.config.js`、`.env`、`.env.example`、`prometheus.yml` | ✅ |
| 2.1 | 开发 simulator | `core/services/simulator/` 完整实现 | ✅ |
| 2.2 | 开发 ingest | `core/services/ingest/` 完整实现 | ✅ |
| 2.3 | 开发 data-writer | `core/services/data-writer/` 完整实现 | ✅ |
| 2.4 | 主题确认 | `TOPICS` 常量、主题测试、Kafka 初始化脚本 | ✅ |
| 2.5 | simulator 测试 | `tests/simulator.*.test.ts` | ✅ |
| 2.6 | ingest 测试 | `tests/ingest.*.test.ts` | ✅ |
| 2.7 | data-writer 测试 | `tests/dataWriter.*.test.ts` | ✅ |
| 2.8 | 集成测试 | `tests/integration.mqttToPg.test.ts` | ⬜ |
| 2.9 | 文档 | `docs/simulator.V1.md`、`docs/ingest.V1.md`、`docs/dataWriter.V1.md`、`docs/messageBus.V2.md` | ✅ |

## destination.md 里的阶段二任务

| 序号 | 任务 | 怎么完成 | 产出 | 状态 |
|---|---|---|---|---|
| 2.1 | 开发 simulator | 状态机 + GPS 生成器，500 辆模拟 | `core/services/simulator/` | ✅ |
| 2.2 | 开发 ingest | 订阅 MQTT，转发消息总线；订阅总线，下发 MQTT | `core/services/ingest/` | ✅ |
| 2.3 | 开发 data-writer | 消费消息总线，写 PG 和 Redis | `core/services/data-writer/` | ✅ |
| 2.4 | 定义消息总线主题 | 创建 4 个主题，设置分区和保留策略 | 主题配置 + init-kafka-topics.js | ✅ |
| 2.5 | 编写 simulator 测试 | 单元测试：状态机、车辆数量 | `simulator.stateMachine.test.ts` | ✅ |
| 2.6 | 编写 ingest 测试 | 单元测试：MQTT 转总线、下行命令 | `ingest.mqttToBus.test.ts` | ✅ |
| 2.7 | 编写 data-writer 测试 | 单元测试：PG 插入、Upsert | `dataWriter.pgInsert.test.ts` | ✅ |
| 2.8 | 编写消息总线测试 | 单元测试：各适配器、切换 | `messageBus.*.test.ts` | ✅（新增 topics 测试） |
| 2.9 | 编写集成测试 | MQTT → 消息总线 → PG 全链路 | `integration.mqttToPg.test.ts` | ⬜ |
| 2.10 | 编写功能文档 | 每个功能一个文档 | `simulator.V1.md` 等 | ✅ |

## 阶段二验收标准

| 项 | 标准 | 状态 |
|---|---|---|
| 类型检查 | `make typecheck` 通过 | ✅ |
| Lint | `make lint` 通过 | ✅ |
| 单元测试 | `make test-unit` 通过 | ✅（simulator + ingest + data-writer + topics） |
| 构建 | `make build` 通过 | ✅ |
| Registry | `make registry-check` 通过 | ✅ |
| 数据流 | simulator 发 MQTT → ingest 转总线 → data-writer 写 PG/Redis | ⬜（三服务已实现，集成测试未做） |
| 可观测 | 三个服务 `/metrics`、`/health` 可访问 | ⬜（simulator、ingest 已验证，data-writer 待验证） |
| 总线可切换 | `MESSAGE_BUS=memory` 和 `MESSAGE_BUS=mqtt` 都能跑 | ⬜（未验证） |
| 文档 | 四篇 V1/V2 文档就位 | ✅ |

## 阶段二阶段文档

| 文档 | 状态 |
|---|---|
| `docs/simulator.V1.md` | ✅ |
| `docs/ingest.V1.md` | ✅ |
| `docs/dataWriter.V1.md` | ✅ |
| `docs/messageBus.V2.md` | ✅ |

---

# 三、下一步

阶段 2.4 完成，阶段二只剩 **2.8 集成测试**。

## 阶段 2.8：集成测试

**目标**：验证 MQTT → 总线 → PG 完整链路。

**文件**：`tests/integration.mqttToPg.test.ts`

**做法**（简化版）：
- `MESSAGE_BUS=memory`（同一进程内共享 memory 总线）。
- Mock MQTT（不真连 EMQX）。
- Mock PG + Mock Redis（不真连数据库）。
- 流程：
  1. 创建共享 memory 总线。
  2. 启动 ingest（注入 mock MQTT + 共享总线）。
  3. 启动 data-writer（注入 mock PG + mock Redis + 共享总线）。
  4. 通过 mock MQTT 的 handler 发一条遥测。
  5. `waitFor` data-writer 收到并写入 mock PG。
  6. 断言 mock PG 的 SQL 和参数。

**关键**：ingest 和 data-writer 用同一个 memory 总线实例，才能在同一进程内互通。

**请确认：是否开始阶段 2.8 集成测试？**