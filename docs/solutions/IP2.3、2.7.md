# 一、阶段 2.3 经验总结

## 1. 完成了什么

阶段 2.3 完成了 **data-writer 服务的完整实现 + 单元测试 + 文档**，让总线上的三类事件能落地到 PostgreSQL 和 Redis。

| 类别 | 产出 | 状态 |
|---|---|---|
| 包配置 | `core/services/data-writer/package.json`、`tsconfig.json` | ✅ |
| 类型定义 | `src/types.ts`：`TelemetryRawPayload`、`TelemetryAggregatedPayload`、`AlertPayload`、`DataWriterConfig` | ✅ |
| 配置加载 | `src/config.ts`：`loadDataWriterConfig`，3 个环境变量 | ✅ |
| 数据映射 | `src/mapper.ts`：6 个映射函数 | ✅ |
| PG 写入器 | `src/pg-writer.ts`：`createPgWriter`，UPSERT + INSERT | ✅ |
| Redis 写入器 | `src/redis-writer.ts`：`createRedisWriter`，热路径 | ✅ |
| 三个 handler | `handlers/telemetry-raw.ts`、`telemetry-aggregated.ts`、`events-alerts.ts` | ✅ |
| 服务组合 | `src/service.ts`：`createDataWriterService`，订阅三个主题 | ✅ |
| 统一出口 | `src/index.ts` | ✅ |
| 启动入口 | `src/server-entry.ts`，支持 SIGTERM/SIGINT | ✅ |
| 单元测试 | 5 个测试文件，约 30 个测试全绿 | ✅ |
| 文档 | `docs/dataWriter.V1.md` | ✅ |

**核心成果**：
- `telemetry.raw` → UPSERT `vehicle_latest` + INSERT `vehicle_telemetry` + 写 Redis 热路径。
- `telemetry.aggregated` → 写 Redis 区域统计。
- `events.alerts` → INSERT `alerts` + 写 Redis 最近告警列表。
- 按 `vehicle_id` 写 Redis，key 设计清晰。
- 可注入依赖（`pg`、`redis`、`bus`），单元测试不用真连中间件。

## 2. 怎么完成的

**第一步：建包骨架。**
`package.json` 声明依赖 `libs`、`message-bus`、`observability`。
`tsconfig.json` 的 `references` 指向 `core/libs`、`shared/message-bus`、`observability`。

**第二步：自底向上写代码。**
1. `types.ts` — 类型定义，无依赖。
2. `config.ts` — 环境变量配置。
3. `mapper.ts` — 纯函数映射，无副作用。
4. `pg-writer.ts` — PG SQL 封装。
5. `redis-writer.ts` — Redis key 封装。
6. `handlers/*.ts` — 三个主题的处理逻辑。
7. `service.ts` — 组合订阅三个主题。
8. `index.ts` — 统一出口。
9. `server-entry.ts` — 启动入口。

**第三步：设计关键决策。**
- **只订阅总线，不连 MQTT**：与 ingest 的关键差异。
- **唯一连库的服务**：只有 data-writer 碰 PG 和 Redis。
- **可注入依赖**：`pg`、`redis`、`bus` 都可通过 options 替换。
- **每条消息独立 try/catch**：一条失败不影响下一条。
- **`pg-writer` 和 `redis-writer` 只做 IO**：不含业务逻辑。
- **handler 只做流程编排**：调用 pg-writer、redis-writer、metrics。
- **Redis key 设计规范**：`vehicle:{id}:latest`、`vehicles:active`、`alerts:recent`、`region:{region}:stats`。

**第四步：写测试。**
5 个测试文件：
- `config`：默认值、环境变量覆盖、非法值抛错。
- `mapper`：6 个映射函数的参数和格式。
- `pgWriter`：SQL 语句和参数正确性。
- `redisWriter`：key 设计、TTL、lpush + ltrim。
- `handlers`：三个 handler 的调用顺序和指标。

**第五步：写文档。**
按 `docs/README.md` 模板，写 `dataWriter.V1.md`，记录三个主题的处理流程、PG 写入、Redis key 设计。

## 3. 遇到了什么问题

### 问题一：TS2740 类型不匹配

**现象：**
```
core/services/data-writer/src/service.ts:79:9 - error TS2740:
Type 'MetricsRegistry' is missing the following properties
from type 'ObservabilityMetrics': httpRequests, httpDuration,
dataFlowMessages, dataFlowLatency, and 5 more.
```

**原因：**
`service.ts` 里给 handler 传的是 `observability.metrics.registry`（类型 `MetricsRegistry`），但 handler 期望的是 `observability.metrics`（类型 `ObservabilityMetrics`）。

**区别**：

| 属性 | 类型 | 用途 |
|---|---|---|
| `observability.metrics` | `ObservabilityMetrics` | 9 个预定义指标（`dataFlowMessages` 等） |
| `observability.metrics.registry` | `MetricsRegistry` | 底层 prom-client 封装，用于创建新指标 |

**解决：**
```bash
sed -i 's/metrics: observability.metrics.registry/metrics: observability.metrics/g' \
  core/services/data-writer/src/service.ts
```

**教训：**
handler 里用现成指标（`deps.metrics.dataFlowMessages.inc(...)`），不用底层 registry。用底层 registry 创建新 counter 会导致重复注册同一指标名，prom-client 会抛错。

### 问题二：telemetry-aggregated 没有对应的 RedisWriter 方法

**现象：**
第一版 `handlers/telemetry-aggregated.ts` 里想写区域统计，但 `RedisWriter` 接口只暴露了 `writeVehicleLatest` 和 `writeRecentAlert`，没有写 hash 的方法。

最初写了个占位：
```ts
const key = `region:${payload.region}:stats`;
const client = deps.redisWriter['raw' as never] as never;
void key;
void client;
```
这不对，是绕过类型系统的黑魔法。

**解决：**
给 `RedisWriter` 接口加一个方法：
```ts
async writeRegionStats(a: TelemetryAggregatedPayload): Promise<void> {
  const key = `region:${a.region}:stats`;
  await redis.hset(key, 'window_start', String(a.window_start));
  await redis.hset(key, 'window_end', String(a.window_end));
  await redis.hset(key, 'vehicle_count', String(a.vehicle_count));
  await redis.hset(key, 'avg_speed', String(a.avg_speed));
  await redis.hset(key, 'avg_battery', String(a.avg_battery));
}
```
handler 直接调 `deps.redisWriter.writeRegionStats(payload)`。

**教训：**
不要在 handler 里绕类型系统调 `redis.raw()`。应该把 Redis 操作封装到 `RedisWriter`，handler 只调接口。

### 问题三：prom-client 重复注册风险

**现象：**
第一版 handler 里写：
```ts
deps.metrics
  .counter('apiscloud_dataflow_messages_total', '数据流消息数', ['topic', 'direction'])
  .inc({ topic: TOPICS.TELEMETRY_RAW, direction: 'in' });
```
每次调用 `counter(...)` 都会创建新 Counter，注册到同一个 registry，prom-client 会抛错 `A metric with the name ... has already been registered`。

**解决：**
handler 里不创建新 counter，直接用 observability 已经建好的 `dataFlowMessages`：
```ts
deps.metrics.dataFlowMessages.inc({
  topic: TOPICS.TELEMETRY_RAW,
  direction: 'in',
});
```

**教训：**
指标只在 observability 服务里创建一次，其他服务通过 `observability.metrics.<name>` 引用。不要重复创建。

## 4. 关键经验

1. **data-writer 只订阅总线**：不连 MQTT，与 ingest 的关键差异。
2. **唯一连库的服务**：只有 data-writer 碰 PG 和 Redis，其他服务不碰。
3. **pg-writer 和 redis-writer 只做 IO**：业务逻辑在 handler 和 service。
4. **可注入依赖是测试关键**：`pg`、`redis`、`bus` 都可通过 options 替换。
5. **指标只在 observability 创建一次**：其他服务引用 `observability.metrics.<name>`，不重复创建。
6. **handler 用现成指标，不碰底层 registry**：避免重复注册。
7. **不要在 handler 里绕过封装调 `redis.raw()`**：给 RedisWriter 加方法，handler 只调接口。
8. **每条消息独立 try/catch**：一条失败不影响下一条。
9. **Redis key 设计规范**：`vehicle:{id}:latest`、`vehicles:active`、`alerts:recent`、`region:{region}:stats`。
10. **ts 毫秒转 ISO**：PG 的 `TIMESTAMPTZ` 用 `to_timestamp` 或 ISO 字符串。

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
| 2.4 | 主题确认 | 用 `TOPICS` 常量，不硬编码 | ✅ |
| 2.5 | simulator 测试 | `tests/simulator.*.test.ts` | ✅ |
| 2.6 | ingest 测试 | `tests/ingest.*.test.ts` | ✅ |
| 2.7 | data-writer 测试 | `tests/dataWriter.*.test.ts` | ✅ |
| 2.8 | 集成测试 | `tests/integration.mqttToPg.test.ts` | ⬜ |
| 2.9 | 文档 | `docs/simulator.V1.md`、`docs/ingest.V1.md`、`docs/dataWriter.V1.md`、`docs/messageBus.V2.md` | ⬜（simulator、ingest、dataWriter ✅） |

## destination.md 里的阶段二任务

| 序号 | 任务 | 怎么完成 | 产出 | 状态 |
|---|---|---|---|---|
| 2.1 | 开发 simulator | 状态机 + GPS 生成器，500 辆模拟 | `core/services/simulator/` | ✅ |
| 2.2 | 开发 ingest | 订阅 MQTT，转发消息总线；订阅总线，下发 MQTT | `core/services/ingest/` | ✅ |
| 2.3 | 开发 data-writer | 消费消息总线，写 PG 和 Redis | `core/services/data-writer/` | ✅ |
| 2.4 | 定义消息总线主题 | 创建 4 个主题，设置分区和保留策略 | 主题配置 | ✅（代码已定） |
| 2.5 | 编写 simulator 测试 | 单元测试：状态机、车辆数量 | `simulator.stateMachine.test.ts` | ✅ |
| 2.6 | 编写 ingest 测试 | 单元测试：MQTT 转总线、下行命令 | `ingest.mqttToBus.test.ts` | ✅ |
| 2.7 | 编写 data-writer 测试 | 单元测试：PG 插入、Upsert | `dataWriter.pgInsert.test.ts` | ✅ |
| 2.8 | 编写消息总线测试 | 单元测试：各适配器、切换 | `messageBus.*.test.ts` | ⬜ |
| 2.9 | 编写集成测试 | MQTT → 消息总线 → PG 全链路 | `integration.mqttToPg.test.ts` | ⬜ |
| 2.10 | 编写功能文档 | 每个功能一个文档 | `simulator.V1.md` 等 | ⬜（simulator、ingest、dataWriter ✅） |

## 阶段二验收标准

| 项 | 标准 | 状态 |
|---|---|---|
| 类型检查 | `make typecheck` 通过 | ✅ |
| Lint | `make lint` 通过 | ✅ |
| 单元测试 | `make test-unit` 通过 | ✅（simulator + ingest + data-writer） |
| 构建 | `make build` 通过 | ✅ |
| Registry | `make registry-check` 通过 | ✅ |
| 数据流 | simulator 发 MQTT → ingest 转总线 → data-writer 写 PG/Redis | ⬜（三服务已实现，集成测试未做） |
| 可观测 | 三个服务 `/metrics`、`/health` 可访问 | ⬜（simulator、ingest 已验证，data-writer 待验证） |
| 总线可切换 | `MESSAGE_BUS=memory` 和 `MESSAGE_BUS=mqtt` 都能跑 | ⬜（未验证） |
| 文档 | 四篇 V1 文档就位 | ⬜（simulator、ingest、dataWriter ✅） |

## 阶段二阶段文档

| 文档 | 状态 |
|---|---|
| `docs/simulator.V1.md` | ✅ |
| `docs/ingest.V1.md` | ✅ |
| `docs/dataWriter.V1.md` | ✅ |
| `docs/messageBus.V2.md` | ⬜ |

---

# 三、下一步

阶段 2.3 完成，还剩两个子任务：

**2.8 集成测试**：`tests/integration.mqttToPg.test.ts`，验证 MQTT → 总线 → PG 全链路。

**2.9 收尾**：`docs/messageBus.V2.md`，记录阶段二对消息总线的使用情况。

## 2.8 集成测试思路

**目标**：验证 simulator → ingest → data-writer → PG 的完整链路。

**做法**（推荐简化版）：
- `MESSAGE_BUS=memory`（同一进程内共享 memory 总线实例）。
- Mock MQTT（不真连 EMQX）。
- 真实 PG（如果 `make infra-up` 已起），或 Mock PgClient。
- 真实 Redis，或 Mock RedisWrapper。
- 流程：
  1. 创建共享 memory 总线。
  2. 启动 ingest（注入 mock MQTT + 共享总线）。
  3. 启动 data-writer（注入 mock PG + mock Redis + 共享总线）。
  4. 用 mock MQTT 的 handler 发一条遥测。
  5. `waitFor` PG 写入被调用。
  6. 断言 mock PG 的 SQL 和参数。
  7. 断言 mock Redis 的 key 和 TTL。

**关键**：ingest 和 data-writer 用同一个 memory 总线实例，才能在同一进程内互通。

## 2.9 文档思路

`docs/messageBus.V2.md` 在 `messageBus.V1.md` 基础上追加：
- 阶段二实际使用情况：simulator 走 MQTT，ingest 订阅 MQTT + 发布总线，data-writer 订阅总线。
- MQTT topic 与总线 topic 的映射关系。
- `partitionKey = vehicle_id` 的设计。
- 消费者组 `apiscloud-ingest`、`apiscloud-data-writer`。

---

**请确认：是先做 2.8 集成测试，还是先做 2.9 文档？推荐先做 2.8，因为集成测试是阶段二验收的核心。**