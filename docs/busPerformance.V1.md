# 消息总线性能策略 V1

## 一、功能目标

功能增多后，消息总线不成为瓶颈。通过 8 项策略，从订阅、分区、消费、查询四个维度降低总线和插件的压力。

**核心问题：**

- 高频遥测（1-10Hz）压垮消费者。
- 每个插件各占消费者组，扇出爆炸。
- 状态查询走 Kafka，消息总线变成查询总线。
- 新插件默认订阅原始主题，无效调用过多。

**核心目标：**

- 消息总线只负责"事件流"，不负责"状态查询"。
- 插件默认订阅聚合层，不订阅原始层。
- 单一消费者组分发，扇出最小化。
- 未激活插件不占消费者名额。

## 二、基础实现

### 2.1 8 项策略总览

| 序号 | 策略 | 作用 | 落地情况 |
|---|---|---|---|
| 1 | 主题分层 | raw / aggregated / events 三层分离 | ✅ 阶段五明确 |
| 2 | 选择性订阅 | 插件声明 filter，只收需要的数据 | ✅ 阶段五实现 |
| 3 | 共享消费者组 | 相似插件共享 groupId | ✅ 阶段五实现 |
| 4 | Redis 热路径 | 高频查询走 Redis，不压消息总线 | ✅ 阶段三起 |
| 5 | 批量消费 | max.poll.records 调优 | ⬜ 预留接口 |
| 6 | 按车辆分区 | 分区键为 vehicle_id，并行消费 | ✅ 阶段二起 |
| 7 | 插件懒订阅 | 未激活不占消费者名额 | ✅ 阶段五实现 |
| 8 | 总线可切换 | 按场景选 Kafka/Pulsar/NATS/Redis | ✅ 阶段一起 |

### 2.2 文件位置

```
shared/message-bus/
├── topics.ts                     — 主题常量 + 分层语义
├── interface.ts                  — SubscribeOptions 含 filter / partitionKey / batchSize
└── adapters/
    ├── memory.ts
    ├── mqtt.ts
    └── kafka.ts

core/plugin-host/src/
├── host.ts                       — dispatchMessage 应用 filter + activated
├── schema.ts                     — TopicFilterSchema
└── types.ts                      — TopicFilter

core/services/gateway/src/
└── service.ts                    — subscribeToPluginTopics 用 getSubscribedTopics

core/services/data-writer/src/
├── query.ts                      — Redis / PG 查询函数
└── server.ts                     — /api/query/* 端点
```

## 三、逐项说明

### 3.1 主题分层

**问题：** 所有插件订阅同一个 `telemetry` 主题，高频数据（1-10Hz）压垮插件。

**方案：** 按语义分 3 层。

| 层 | 主题 | 频率 | 保留 | 生产者 | 消费者 |
|---|---|---|---|---|---|
| 高频层 | telemetry.raw | 1-10Hz | 6h | ingest | data-writer、dispatch-core、aggregator、route-optimizer |
| 低频层 | telemetry.aggregated | 5s | 72h | aggregator | data-writer、charging-scheduler、dashboard |
| 事件层 | events.commands | 事件驱动 | 7d | dispatch-core、charging-scheduler、route-optimizer | ingest、data-writer |
| 事件层 | events.alerts | 事件驱动 | 7d | geofence、anomaly | data-writer |

**订阅规则：**

- 新插件默认订阅 `telemetry.aggregated`，不订阅 `telemetry.raw`。
- 只有确实需要单条原始数据的插件才订阅 `telemetry.raw`。
- 事件驱动插件订阅 `events.*`。

**示例对比：**

| 插件 | 订阅 | 理由 |
|---|---|---|
| charging-scheduler | telemetry.aggregated | 只需要低电量车辆列表，不需要单条数据 |
| route-optimizer | telemetry.raw + filter | 需要单车速度，用 filter 减量 |
| dashboard | 无 | 通过 HTTP 拉数据，不消费总线 |

**收益：**

- 高频数据只被需要的消费者处理。
- 聚合层流量降低 100 倍（5s vs 1Hz）。
- 插件不会被高频数据压垮。

### 3.2 选择性订阅

**问题：** 订阅了 `telemetry.raw` 的插件收到所有消息，但只关心一部分（如只关心 running 状态的车）。

**方案：** `plugin.json` 的 `topics.filter` 声明过滤条件。

**声明方式：**

```json
{
  "topics": {
    "subscribe": ["telemetry.raw"],
    "filter": {
      "field": "status",
      "equals": "running"
    }
  }
}
```

**两种过滤模式：**

| 模式 | 语义 |
|---|---|
| `equals` | 等值匹配 `payload[field] === value` |
| `in` | 成员匹配 `payload[field] in values` |

**字段路径支持点分：**

- `field: 'status'` → `payload.status`
- `field: 'position.lat'` → `payload.position.lat`

**应用位置：** `PluginHost.dispatchMessage`

```ts
async dispatchMessage(topic: string, envelope: Envelope): Promise<void> {
  for (const { instance, manifest } of this.registry.list()) {
    if (!instance.onMessage) continue;
    if (!this.activated.has(manifest.name)) continue;

    const subscribed = manifest.topics?.subscribe ?? [];
    if (!subscribed.includes(topic)) continue;

    const filter = manifest.topics?.filter;
    if (filter && !matchesFilter(envelope, filter)) continue;

    // 只有通过 filter 才调 onMessage
    await withTimeout(() => instance.onMessage!(topic, envelope), ...);
  }
}
```

**示例：** route-optimizer 只处理 `status = running` 的遥测。

- 车辆 idle 时发的遥测：filter 拒绝，不调 `onMessage`。
- 车辆 running 时发的遥测：filter 通过，进入插件。

**收益：**

- 减少无效 `onMessage` 调用。
- 插件内部逻辑简化。
- 声明式，不改代码就能调 filter。

### 3.3 共享消费者组

**问题：** 如果每个插件各占一个消费者组，Kafka 场景下组数 = 插件数，扇出爆炸。

**方案：** gateway 用单一消费者组 `apiscloud-gateway`，从 `host.getSubscribedTopics()` 拿所有已激活插件关心的主题，统一订阅，收到后 `dispatchMessage` 分发给各插件。

**实现位置：** `gateway/src/service.ts`

```ts
async function subscribeToPluginTopics(): Promise<void> {
  // 只拿已激活插件关心的主题集合
  const topics = pluginHost.getSubscribedTopics();

  for (const topic of topics) {
    const sub = await bus.subscribe(
      topic,
      async (env: Envelope) => {
        await pluginHost.dispatchMessage(topic, env);
      },
      { groupId: 'apiscloud-gateway' },
    );
    subscriptions.push(sub);
  }
}
```

**对比：**

| 模式 | 消费者组数 | 订阅数 |
|---|---|---|
| 每插件一个组 | N 个（N = 插件数） | N 个 |
| gateway 单组 | 1 个 | topics.length 个 |

**示例：** 10 个插件，其中 3 个订阅 `telemetry.raw`、2 个订阅 `telemetry.aggregated`。

| 模式 | 组数 | Kafka 消费者数 |
|---|---|---|
| 每插件一组 | 10 | 10 |
| gateway 单组 | 1 | 1 |

**收益：**

- Kafka 消费者数大幅降低。
- 同一主题的消息只在 gateway 消费一次。
- 插件数增长不影响 Kafka 负载。

**注意：** Kafka 的 groupId 是"负载均衡"，不是"广播"。如果两个插件直接各用一个 consumer，它们不会都收到消息。gateway 的 `dispatchMessage` 解决了这个问题——它把消息分发给所有订阅的插件。

### 3.4 Redis 热路径

**问题：** 插件需要查询车辆状态、告警、指令时，如果直接消费 Kafka，总线上会堆积大量"查询类"消息，且插件要维护自己的状态。

**方案：** data-writer 把最新状态写到 Redis，暴露 HTTP 查询端点，插件通过 `ctx.http` 调这些端点，不消费 Kafka。

**Redis 结构：**

| key | 类型 | 内容 | TTL |
|---|---|---|---|
| `vehicle:{id}:latest` | string | 最新状态 JSON | 60s |
| `vehicle:{id}` | hash | 最新状态字段 | 无 |
| `vehicles:active` | set | 活跃车辆 ID | 无 |
| `alerts:recent` | list | 最近告警 JSON | 无 |
| `region:{region}:stats` | hash | 区域统计 | 无 |

**data-writer 查询端点：**

| 端点 | 数据源 | 用途 |
|---|---|---|
| `GET /api/query/vehicles/active` | Redis `vehicles:active` + PG `vehicle_latest` | 活跃车辆列表 |
| `GET /api/query/vehicles/:id` | PG `vehicle_latest` | 单车详情 |
| `GET /api/query/alerts/recent` | Redis `alerts:recent` | 最近告警 |
| `GET /api/query/commands/recent` | PG `dispatch_commands` | 最近指令 |

**插件用法：**

```js
async onLoad(ctx) {
  if (ctx.http) http = ctx.http;
  if (ctx.services) services = ctx.services;
}

async getRoutes() {
  return [{
    method: 'GET',
    path: '/api/reporting/summary',
    handler: async (_req, res) => {
      const vehicles = await http.get(
        `${services.dataWriter}/api/query/vehicles/active`
      );
      // ...
    }
  }];
}
```

**收益：**

- 状态查询不压消息总线。
- 插件不需要维护自己的状态。
- 架构原则保持（只有 data-writer 连库）。

**实时性 < 50ms 的场景：** 未来可用 Redis Pub/Sub，不走 Kafka。

### 3.5 批量消费（预留）

**问题：** Kafka 逐条消费（`eachMessage`）在高峰时吞吐不足。

**方案：** `SubscribeOptions` 加 `batchSize?` 字段，未来用 `eachBatch` 实现。

**接口预留：**

```ts
interface SubscribeOptions {
  groupId?: string;
  filter?: (env: Envelope) => boolean;
  partitionKey?: string;
  batchSize?: number;    // 阶段五预留
}
```

**当前状态：**

- `KafkaAdapter.subscribe` 用 `eachMessage`（逐条）。
- `batchSize` 字段已加，未被使用。
- 阶段六实现 `eachBatch` + `autoCommit: false`。

**计划的实现：**

```ts
await consumer.run({
  autoCommit: false,
  eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary }) => {
    for (const message of batch.messages) {
      // 批量处理
      resolveOffset(message.offset);
      await heartbeat();
    }
    await commitOffsetsIfNecessary();
  },
});
```

**收益（实现后）：**

- 吞吐提升 5-10 倍。
- 减少 rebalance。
- 减少网络往返。

### 3.6 按车辆分区

**问题：** 同一车辆的多条消息如果落到不同分区，消费者并行处理时顺序错乱。

**方案：** 发布时 `partitionKey = vehicle_id`，Kafka 保证同一 key 的消息落到同一分区。

**实现位置：** 所有发布点。

**ingest：**

```ts
await busPublisher.publish(TOPICS.TELEMETRY_RAW, env, vehicle_id);
```

**dispatch-core：**

```ts
await bus.publish(TOPICS.EVENTS_COMMANDS, env, {
  partitionKey: command.vehicle_id,
});
```

**charging-scheduler：**

```js
await bus.publish(TOPICS.EVENTS_COMMANDS, env, {
  partitionKey: vehicleId,
});
```

**route-optimizer：**

```js
await bus.publish(TOPICS.EVENTS_COMMANDS, env, {
  partitionKey: telemetry.vehicle_id,
});
```

**收益：**

- 同一车辆的消息按顺序消费。
- 不同车辆并行消费，互不阻塞。
- 消费者负载均衡。

**验证：** `tests/messageBus.partition.test.ts`

### 3.7 插件懒订阅

**问题：** `dashboard` 这类纯前端插件不订阅任何主题，但仍占用消费者名额。

**方案：** `PluginHost` 维护 `activated` 集合，根据 `lazy` 和订阅主题决定是否激活。

**激活规则：**

| lazy | 有订阅主题 | 激活 |
|---|---|---|
| false | 任意 | ✅ 始终激活 |
| true | 有 | ✅ 激活（必须订阅才能工作） |
| true | 无 | ❌ 不激活 |

**实现位置：** `PluginHost.loadAll`

```ts
for (const plugin of targets) {
  const topics = plugin.manifest.topics?.subscribe ?? [];
  if (!plugin.manifest.lazy || topics.length > 0) {
    this.activated.add(plugin.manifest.name);
  }
}
```

**`dispatchMessage` 跳过未激活插件：**

```ts
for (const { instance, manifest } of this.registry.list()) {
  if (!this.activated.has(manifest.name)) continue;
  // ...
}
```

**`getSubscribedTopics` 只返回已激活插件的主题：**

```ts
getSubscribedTopics(): string[] {
  const topics = new Set<string>();
  for (const { manifest } of this.registry.list()) {
    if (!this.activated.has(manifest.name)) continue;
    for (const t of manifest.topics?.subscribe ?? []) {
      topics.add(t);
    }
  }
  return Array.from(topics).sort();
}
```

**手动激活：**

```ts
host.activatePlugin('dashboard');
```

**示例：**

| 插件 | lazy | subscribe | 激活 | 占消费者名额 |
|---|---|---|---|---|
| geofence | true | telemetry.raw | ✅ | 是 |
| charging-scheduler | true | telemetry.aggregated | ✅ | 是 |
| dashboard | true | 无 | ❌ | 否 |
| reporting | true | 无 | ❌ | 否 |

**收益：**

- 纯前端插件不占消费者名额。
- gateway 的订阅主题集合最小化。
- 插件数增长时消费者数不增长。

**验证：** `tests/pluginHost.lazySubscription.test.ts`

### 3.8 总线可切换

**问题：** 不同场景对消息总线的需求不同。测试用内存，生产用 Kafka，设备侧用 MQTT，低延迟用 Redis，超大吞吐用 Pulsar。

**方案：** `MessageBus` 统一接口，适配器可替换，改配置不改业务代码。

**适配器：**

| 适配器 | 媒介 | 场景 |
|---|---|---|
| MemoryAdapter | 内存 | 单元测试、演示 |
| MqttAdapter | MQTT | 外部接入 |
| KafkaAdapter | Kafka | 内部事件流（默认） |

**切换方式：**

```dotenv
MESSAGE_BUS=memory
# 或
MESSAGE_BUS=kafka
# 或
MESSAGE_BUS=mqtt
```

**业务代码不变：**

```ts
// 业务代码只依赖接口
const bus: MessageBus = createMessageBus(config);

await bus.connect();
await bus.subscribe(TOPICS.TELEMETRY_RAW, handler);
await bus.publish(TOPICS.TELEMETRY_RAW, env);
```

**未来可扩展：**

| 场景 | 换什么 | 为什么 |
|---|---|---|
| 实时性 < 10ms | Redis Pub/Sub | Kafka 最低延迟几毫秒 |
| 超高频、允许丢消息 | NATS / Redis Streams | 更轻量 |
| 超大吞吐、流处理 | Pulsar | 存算分离，扩展性更强 |
| 冷数据 | S3 / MinIO | 低成本，长期 |
| 设备侧消息 | MQTT 直连 | 不经过 Kafka |

**收益：**

- 业务代码零改动。
- 按场景选最合适的媒介。
- 未来扩展成本低。

**验证：** `tests/messageBus.switchVerification.test.ts`

## 四、性能验证

### 4.1 验证方式

**不连接真实 Kafka / PG / Redis，用 Mock 验证行为。**

| 测试文件 | 覆盖策略 |
|---|---|
| `tests/messageBus.switchVerification.test.ts` | 3.8 总线可切换 |
| `tests/pluginHost.lazySubscription.test.ts` | 3.7 插件懒订阅 |
| `tests/messageBus.partition.test.ts` | 3.6 按车辆分区 |
| `tests/pluginHost.filter.test.ts` | 3.2 选择性订阅 |
| `tests/integration.pluginEcosystem.test.ts` | 全部策略端到端 |

### 4.2 关键指标（设计目标，阶段五不做压测）

| 指标 | 目标 | 说明 |
|---|---|---|
| 单消费者吞吐 | ≥ 5000 msg/s | Memory 场景 |
| 主题分层后聚合层流量 | ≤ raw 的 1% | 5s vs 1Hz |
| 消费者组数 | = 1（gateway） | 不随插件数增长 |
| 插件激活率 | 有订阅的插件 100% | 无订阅的不激活 |
| 分区键覆盖率 | 100% | 车辆相关消息 |

### 4.3 简化性能测试（阶段五不做）

阶段五不做 5000、10 万、100 万规模的压力测试。

**阶段六计划：**

- 用 simulator 生成不同规模数据（500 / 5000 / 10 万）。
- 用 Prometheus 观察各服务指标。
- 对比优化前后（主题分层前 vs 后、单组 vs 多组）。
- 定义关键指标：消费速率、延迟、积压。

### 4.4 当前基准（仅验证，不代表极限）

**Memory 适配器，单元测试环境：**

- 单次 `dispatchMessage`：< 1ms（10 个插件）
- 单次 `publish`：< 1ms（10 个订阅者）
- `getSubscribedTopics` 调用：< 0.1ms

## 五、分层结构示意

```
                  ┌────────────────────────────────┐
                  │  高频层                         │
                  │  telemetry.raw (1-10Hz, 6h)    │
                  │  生产者: ingest                 │
                  │  消费者: data-writer,           │
                  │         dispatch-core,          │
                  │         aggregator,             │
                  │         route-optimizer         │
                  └──────────────┬─────────────────┘
                                 │
                                 ▼
                  ┌────────────────────────────────┐
                  │  低频层                         │
                  │  telemetry.aggregated (5s, 72h)│
                  │  生产者: aggregator             │
                  │  消费者: data-writer,           │
                  │         charging-scheduler,     │
                  │         dashboard               │
                  └──────────────┬─────────────────┘
                                 │
                                 ▼
                  ┌────────────────────────────────┐
                  │  事件层                         │
                  │  events.commands (7d)           │
                  │  events.alerts (7d)             │
                  │  生产者: dispatch-core,         │
                  │         charging-scheduler,     │
                  │         route-optimizer,        │
                  │         geofence, anomaly       │
                  │  消费者: ingest, data-writer    │
                  └────────────────────────────────┘
```

## 六、订阅路径示意

```
插件 A (charging-scheduler)
  └── 订阅 telemetry.aggregated
  └── plugin.json 无 filter
  └── lazy: true → 激活
       │
       ▼
gateway (apiscloud-gateway) ── 单一消费者组
  └── getSubscribedTopics() = ["telemetry.aggregated", "telemetry.raw"]

插件 B (route-optimizer)
  └── 订阅 telemetry.raw
  └── plugin.json filter: { field: "status", equals: "running" }
  └── lazy: true → 激活

插件 C (dashboard)
  └── 无订阅主题
  └── lazy: true → 不激活
  └── 不占消费者名额
```

## 七、V1 修改

无（首版）。

## 八、后续版本

### 阶段六计划

- **Kafka 批量消费真正实现**：用 `eachBatch` 提升吞吐 5-10 倍。
- **压测对比报告**：500 / 5000 / 10 万规模，对比优化前后。
- **Pulsar / NATS 适配器**：按场景选不同总线。
- **CQRS 读写分离**：写路径和读路径彻底分离。
- **本地缓存**：插件本地缓存热点数据，减少 HTTP 调用。
- **批量写入**：data-writer 攒批 + 事务，减少 PG 压力。

### 长期演进

- **多集群分片**：按业务、区域、优先级分 Kafka 集群。
- **冷热数据分离**：热路径 Redis Pub/Sub，温路径 Kafka，冷路径 S3。
- **精确一次语义**：从至少一次 + 去重升级为精确一次。
- **全局有序**：从按车辆分区升级为全局有序。
- **分布式事务**：跨服务的指令和状态同步。

### 边界说明

有些能力是媒介特有的，抽象层抹不平：

| 能力 | 处理 |
|---|---|
| 事务 | 抽象层不暴露，特殊需求直接用原生 SDK |
| 精确一次 | 抽象层降级为至少一次 + 去重 |
| 全局有序 | 抽象层不承诺 |
| 流处理 | 不抽象，作为独立能力 |

## 九、一句话总结

**消息总线性能策略的核心是"分层订阅、共享消费、懒激活、热路径分离、按车分区、总线可换"。8 项策略让消息总线只负责事件流，不负责状态查询；让插件默认订阅聚合层，不订阅原始层；让 gateway 单消费者组分发，不每个插件占一组；让 dashboard 这类纯前端插件不占名额。功能再多，消息总线不成为瓶颈。**