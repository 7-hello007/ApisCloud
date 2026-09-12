# 一、阶段 2.2 经验总结

## 1. 完成了什么

阶段 2.2 完成了 **ingest 服务的完整实现 + 单元测试 + 文档**，让 MQTT 外部数据能进入内部消息总线，命令能从总线下发回 MQTT。

| 类别 | 产出 | 状态 |
|---|---|---|
| 包配置 | `core/services/ingest/package.json`、`tsconfig.json` | ✅ |
| 类型定义 | `src/types.ts`：`UplinkTelemetry`、`DownlinkCommand`、`IngestConfig` | ✅ |
| 配置加载 | `src/config.ts`：`loadIngestConfig`，3 个环境变量 | ✅ |
| 输入校验 | `src/validation.ts`：上行/下行 zod schema | ✅ |
| 协议映射 | `src/mapper.ts`：`telemetryToEnvelope`、`envelopeToCommand` | ✅ |
| MQTT 订阅 | `src/mqtt-subscriber.ts`：`createMqttSubscriber` | ✅ |
| MQTT 发布 | `src/mqtt-publisher.ts`：`createMqttPublisher` | ✅ |
| 总线发布 | `src/bus-publisher.ts`：`createBusPublisher` | ✅ |
| 总线订阅 | `src/bus-subscriber.ts`：`createBusSubscriber` | ✅ |
| 服务组合 | `src/service.ts`：`createIngestService`，双向处理 | ✅ |
| 统一出口 | `src/index.ts` | ✅ |
| 启动入口 | `src/server-entry.ts`，支持 SIGTERM/SIGINT | ✅ |
| 单元测试 | 5 个测试文件，约 30 个测试全绿 | ✅ |
| 文档 | `docs/ingest.V1.md` | ✅ |

**核心成果**：
- 上行：MQTT `telemetry/raw` → 校验 → Envelope → 总线 `telemetry.raw`。
- 下行：总线 `events.commands` → 校验 → MQTT `commands/{vehicle_id}`。
- 输入校验用 `@apiscloud/libs` 的 schema，非法数据丢弃并 warn。
- 总线发布按 `vehicle_id` 分区，保证同车消息顺序。
- 可注入依赖（`mqttSubscriber`、`mqttPublisher`、`bus`），单元测试不用真实中间件。

## 2. 怎么完成的

**第一步：建包骨架。**
`package.json` 声明依赖 `libs`、`message-bus`、`observability`、`zod`。
`tsconfig.json` 的 `references` 指向 `core/libs`、`shared/message-bus`、`observability`。

**第二步：自底向上写代码。**
1. `types.ts` — 类型定义，无依赖。
2. `config.ts` — 环境变量配置。
3. `validation.ts` — zod schema，复用 libs 的 `VehicleId` 等。
4. `mapper.ts` — 协议映射，用 `createEnvelope` 和 `TOPICS`。
5. `mqtt-subscriber.ts` — 订阅 MQTT。
6. `mqtt-publisher.ts` — 发布 MQTT。
7. `bus-publisher.ts` — 发布总线。
8. `bus-subscriber.ts` — 订阅总线。
9. `service.ts` — 组合所有，双向处理。
10. `index.ts` — 统一出口。
11. `server-entry.ts` — 启动入口。

**第三步：设计关键决策。**
- **ingest 引入 `message-bus`**：与 simulator 的关键差异。
- **MQTT 订阅器和发布器独立连接**：避免订阅和发布互相影响。
- **可注入依赖**：`mqttSubscriber`、`mqttPublisher`、`bus` 可被测试替换。
- **每条消息独立 try/catch**：一条失败不影响下一条。
- **总线发布按 `vehicle_id` 分区**：Kafka 场景保证同车消息顺序。
- **输入校验用 libs 的 schema**：复用 `VehicleId`、`Latitude`、`Longitude`、`Battery`。

**第四步：写测试。**
5 个测试文件：
- `validation`：schema 接受合法、拒绝非法、边界值。
- `mapper`：上行映射、下行提取。
- `config`：默认值、环境变量覆盖。
- `mqttToBus`：mock MQTT + mock 总线，验证上行链路。
- `busToMqtt`：mock 总线 + mock MQTT，验证下行链路。

**第五步：写文档。**
按 `docs/README.md` 模板，写 `ingest.V1.md`，记录上行/下行流程、校验规则、健康检查、指标。

## 3. 遇到了什么问题

### 问题一：ESLint 报 `_drop` 未使用

**现象：**
```
tests/ingest.validation.test.ts
  27:27  warning  '_drop' is assigned a value but never used  @typescript-eslint/no-unused-vars
 132:27  warning  '_drop' is assigned a value but never used  @typescript-eslint/no-unused-vars
```

**原因：**
测试里用解构剔除字段：
```ts
const { vehicle_id: _drop, ...rest } = validTelemetry();
```
变量 `_drop` 从未使用，ESLint 的 `no-unused-vars` 默认不忽略 `_` 前缀。

**解决：**
方案 A（推荐）：改 `.eslintrc.json` 的 `rules`：
```json
"@typescript-eslint/no-unused-vars": [
  "warn",
  {
    "argsIgnorePattern": "^_",
    "varsIgnorePattern": "^_",
    "caughtErrorsIgnorePattern": "^_"
  }
]
```
`_` 开头变量被忽略。以后所有测试都用得上。

方案 B（备选）：改用 `delete`：
```ts
const telemetry = validTelemetry();
delete (telemetry as Partial<typeof telemetry>).vehicle_id;
```

**教训：**
TS 项目里 `_` 前缀忽略未使用变量是通用惯例，应在 ESLint 配置里一次性加好。

## 4. 关键经验

1. **ingest 双向**：上行订阅 MQTT 发总线，下行订阅总线发 MQTT。
2. **可注入依赖是测试关键**：`mqttSubscriber`、`mqttPublisher`、`bus` 都可通过 options 替换，单元测试不用真连中间件。
3. **复用 libs 的 schema**：输入校验不重复造轮子。
4. **每条消息独立 try/catch**：一条失败不影响下一条。
5. **按 vehicle_id 分区**：Kafka 场景保证同车消息顺序。
6. **MQTT 订阅和发布独立连接**：避免互相影响。
7. **ESLint `_` 前缀规则一次配好**：以后所有测试受益。
8. **测试用 mock 模拟边界**：非法 payload、非 JSON、缺少字段，都覆盖。

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
| 2.3 | 开发 data-writer | `core/services/data-writer/` 完整实现 | ⬜ |
| 2.4 | 主题确认 | 用 `TOPICS` 常量，不硬编码 | ✅（simulator + ingest 已用） |
| 2.5 | simulator 测试 | `tests/simulator.*.test.ts` | ✅ |
| 2.6 | ingest 测试 | `tests/ingest.*.test.ts` | ✅ |
| 2.7 | data-writer 测试 | `tests/dataWriter.*.test.ts` | ⬜ |
| 2.8 | 集成测试 | `tests/integration.mqttToPg.test.ts` | ⬜ |
| 2.9 | 文档 | `docs/simulator.V1.md`、`docs/ingest.V1.md`、`docs/dataWriter.V1.md`、`docs/messageBus.V2.md` | ⬜（simulator、ingest ✅） |

## destination.md 里的阶段二任务

| 序号 | 任务 | 怎么完成 | 产出 | 状态 |
|---|---|---|---|---|
| 2.1 | 开发 simulator | 状态机 + GPS 生成器，500 辆模拟 | `core/services/simulator/` | ✅ |
| 2.2 | 开发 ingest | 订阅 MQTT，转发消息总线；订阅总线，下发 MQTT | `core/services/ingest/` | ✅ |
| 2.3 | 开发 data-writer | 消费消息总线，写 PG 和 Redis | `core/services/data-writer/` | ⬜ |
| 2.4 | 定义消息总线主题 | 创建 4 个主题，设置分区和保留策略 | 主题配置 | ✅（代码已定） |
| 2.5 | 编写 simulator 测试 | 单元测试：状态机、车辆数量 | `simulator.stateMachine.test.ts` | ✅ |
| 2.6 | 编写 ingest 测试 | 单元测试：MQTT 转总线、下行命令 | `ingest.mqttToBus.test.ts` | ✅ |
| 2.7 | 编写 data-writer 测试 | 单元测试：PG 插入、Upsert | `dataWriter.pgInsert.test.ts` | ⬜ |
| 2.8 | 编写消息总线测试 | 单元测试：各适配器、切换 | `messageBus.*.test.ts` | ⬜ |
| 2.9 | 编写集成测试 | MQTT → 消息总线 → PG 全链路 | `integration.mqttToPg.test.ts` | ⬜ |
| 2.10 | 编写功能文档 | 每个功能一个文档 | `simulator.V1.md` 等 | ⬜（simulator、ingest ✅） |

## 阶段二验收标准

| 项 | 标准 | 状态 |
|---|---|---|
| 类型检查 | `make typecheck` 通过 | ✅ |
| Lint | `make lint` 通过 | ✅ |
| 单元测试 | `make test-unit` 通过 | ✅（simulator + ingest 部分） |
| 构建 | `make build` 通过 | ✅ |
| Registry | `make registry-check` 通过 | ✅ |
| 数据流 | simulator 发 MQTT → ingest 转总线 → data-writer 写 PG/Redis | ⬜（simulator、ingest ✅，data-writer 未做） |
| 可观测 | 三个服务 `/metrics`、`/health` 可访问 | ⬜（simulator、ingest ✅） |
| 总线可切换 | `MESSAGE_BUS=memory` 和 `MESSAGE_BUS=mqtt` 都能跑 | ⬜（未验证） |
| 文档 | 四篇 V1 文档就位 | ⬜（simulator、ingest ✅） |

## 阶段二阶段文档

| 文档 | 状态 |
|---|---|
| `docs/simulator.V1.md` | ✅ |
| `docs/ingest.V1.md` | ✅ |
| `docs/dataWriter.V1.md` | ⬜ |
| `docs/messageBus.V2.md` | ⬜ |

---

# 三、下一步

阶段 2.2 完成，进入 **阶段 2.3：开发 data-writer**。

阶段 2.3 要创建这些文件：

```
core/services/data-writer/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts
    ├── config.ts
    ├── handlers/
    │   ├── telemetry-raw.ts
    │   ├── telemetry-aggregated.ts
    │   └── events-alerts.ts
    ├── pg-writer.ts
    ├── redis-writer.ts
    ├── mapper.ts
    └── service.ts
```

**data-writer 与 ingest 的关键差异**：
- data-writer 订阅总线，不连 MQTT。
- data-writer 写 PG 和 Redis，是唯一连库的服务。
- data-writer 要处理三个主题：`telemetry.raw`、`telemetry.aggregated`、`events.alerts`。
- data-writer 要 UPSERT `vehicle_latest`，INSERT `vehicle_telemetry` 和 `alerts`。
- data-writer 要写 Redis 热路径。

**请确认：是否从阶段 2.3 的 `package.json` 和 `tsconfig.json` 开始，逐文件输出？**