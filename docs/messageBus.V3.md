# 消息总线 V3

## 一、功能目标

让业务代码只依赖统一接口，不依赖 Kafka SDK。通过配置切换底层媒介，业务代码零改动。

核心规则：改 `MESSAGE_BUS=kafka` → `MESSAGE_BUS=memory`，业务代码不变。

## 二、基础实现

### 2.1 文件位置

```
shared/message-bus/
├── interface.ts      — MessageBus 统一接口
├── envelope.ts       — 统一消息信封
├── topics.ts         — 主题常量
├── factory.ts        — 按配置创建实例
├── adapters/
│   ├── memory.ts     — 内存适配器
│   ├── mqtt.ts       — MQTT 适配器
│   └── kafka.ts      — Kafka 适配器
└── index.ts          — 统一出口
```

### 2.2 统一接口

`MessageBus` 接口定义 6 个方法：

| 方法 | 作用 |
|---|---|
| `connect()` | 连接总线 |
| `publish(topic, env, options?)` | 发布消息 |
| `subscribe(topic, handler, options?)` | 订阅消息 |
| `commit(topic, offset)` | 提交消费位点 |
| `health()` | 健康检查 |
| `close()` | 关闭总线 |

`type` 是只读属性，取值 `'memory' | 'mqtt' | 'kafka'`。

### 2.3 订阅选项

`SubscribeOptions` 字段：

| 字段 | 说明 |
|---|---|
| `groupId?` | 消费者组（Kafka 用） |
| `filter?` | 过滤函数，返回 false 则跳过 |
| `partitionKey?` | 分区键（Kafka 用） |

### 2.4 统一信封

```json
{
  "id": "uuid",
  "topic": "telemetry.raw",
  "source": "simulator",
  "timestamp": 1730000000000,
  "trace_id": "trace-xxx",
  "span_id": "span-xxx",
  "version": "1.0",
  "payload": {}
}
```

未提供 `trace_id`/`span_id` 时自动生成，为未来全链路追踪预留。

`envelope.ts` 导出 5 个函数：

| 函数 | 作用 |
|---|---|
| `createEnvelope(options)` | 创建标准信封 |
| `validateEnvelope(input)` | zod 校验，非法抛错 |
| `parseEnvelope(raw)` | 从 string 或 Buffer 反序列化 |
| `serializeEnvelope(env)` | 序列化为 Buffer |
| `EnvelopeSchema` | zod schema，可独立使用 |

### 2.5 主题常量

| 主题 | 用途 |
|---|---|
| `telemetry.raw` | 原始遥测（高频，1-10Hz） |
| `telemetry.aggregated` | 聚合遥测（低频） |
| `events.commands` | 调度指令 |
| `events.alerts` | 告警事件 |

`ALL_TOPICS` 是包含全部主题的数组。`TopicName` 是主题名的联合类型。

### 2.6 适配器

| 适配器 | 媒介 | 用途 |
|---|---|---|
| `MemoryAdapter` | 内存 | 单元测试、演示 |
| `MqttAdapter` | MQTT | 外部接入 |
| `KafkaAdapter` | Kafka | 内部事件流 |

**MemoryAdapter**：Map 存订阅，publish 时遍历调用 handler，支持 filter、多订阅者、unsubscribe。无消费位点，`commit` 为空实现。

**MqttAdapter**：复用 `@apiscloud/libs` 的 mqtt 封装。发布时把 Envelope 序列化为 Buffer，订阅后反序列化。无消费位点，`commit` 为空实现。

**KafkaAdapter**：用 `kafkajs`。支持消费者组、分区键，`eachMessage` 自动提交位点。`groupId` 默认 `apiscloud-<topic 去点>`。

### 2.7 工厂函数

```ts
const bus = createMessageBus(config);
// 按 config.MESSAGE_BUS 返回对应适配器
```

`MESSAGE_BUS` 取值：

| 值 | 返回 |
|---|---|
| `memory` | `MemoryAdapter` |
| `mqtt` | `MqttAdapter` |
| `kafka` | `KafkaAdapter` |

用 `never` 做 exhaustive 检查，未知值直接抛错。

### 2.8 多媒介分段

当前阶段数据流使用两种媒介：

| 段 | 媒介 | 理由 |
|---|---|---|
| 外部 → 接入 | MQTT | 长连接、海量 |
| 内部 | Kafka | 可靠、可回溯 |

未来可扩展 Pulsar、NATS、Redis、S3 适配器，切换只改配置。

### 2.9 依赖

| 依赖 | 用途 |
|---|---|
| `@apiscloud/libs` | mqtt 封装、logger |
| `kafkajs` | Kafka 客户端 |
| `uuid` | 生成消息 ID |
| `zod` | Envelope 校验 |

## 三、V1 修改

### 变更一：MQTT 适配器测试环境 manualConnect

**为什么改：** 单元测试里创建 `MqttAdapter` 会立即自动连接并无限重连，Jest 环境拆除后还在触发，报「Cannot log after tests are done」和「ReferenceError: You are trying to import a file after the Jest environment has been torn down」。

**怎么改：**

- `createMqtt` 加 `manualConnect: config.NODE_ENV === 'test'`，测试环境不自动连接。
- `createMqtt` 的 `reconnectPeriod` 在测试环境设为 0，不重连。
- `MqttAdapter.connect()` 委托给 wrapper 的 `connect()` 方法，wrapper 内部处理超时和错误。
- `MqttAdapter.close()` 用 `try/catch` 包住 `client.end()`，未连接时只移除监听器，任何状态下都不抛错。

**影响：** 测试环境不再自动连接，需要显式调 `connect()`；生产环境行为不变。

## 四、V2 修改

### 变更一：明确 4 个主题的分区数和保留策略

阶段一已定义 4 个主题常量，但未明确 Kafka 层面的配置。V2 补充：

| 主题 | 分区数 | 保留 | 理由 |
|---|---|---|---|
| telemetry.raw | 6 | 6h | 高频，短期保留，长期归档由 data-writer 落库 |
| telemetry.aggregated | 3 | 72h | 聚合数据，中期保留 |
| events.commands | 3 | 7d | 指令审计需要追溯 |
| events.alerts | 3 | 7d | 告警追溯 |

对应脚本：`scripts/init-kafka-topics.js`，Makefile 命令 `make init-topics`。

幂等：脚本先 listTopics，只创建不存在的主题。

### 变更二：阶段二三个服务对总线的实际使用

**simulator**：不碰总线，只发 MQTT。

**ingest**：

- 订阅 MQTT `telemetry/raw`
- 发布总线 `telemetry.raw`，partitionKey = vehicle_id
- 订阅总线 `events.commands`，消费组 apiscloud-ingest
- 发布 MQTT `commands/{vehicle_id}`

**data-writer**：

- 订阅总线 `telemetry.raw`，消费组 apiscloud-data-writer
- 订阅总线 `telemetry.aggregated`，消费组 apiscloud-data-writer
- 订阅总线 `events.alerts`，消费组 apiscloud-data-writer

### 变更三：MQTT topic 与总线 topic 的映射

| MQTT topic | 总线 topic | 方向 | 处理 |
|---|---|---|---|
| telemetry/raw | telemetry.raw | 上行 | ingest 转换 |
| commands/{vehicle_id} | events.commands | 下行 | ingest 转换 |

**约定**：

- MQTT topic 用斜杠：`telemetry/raw`、`commands/{id}`
- 总线 topic 用点：`telemetry.raw`、`events.commands`
- 命名一一对应，方便排查

### 变更四：partitionKey = vehicle_id

ingest 发布 `telemetry.raw` 时，显式传 `partitionKey = vehicle_id`。

好处：

- Kafka 同一车辆的消息落到同一分区，保证顺序
- 消费者按车辆维度并行处理，不会跨车乱序

### 变更五：消费者组命名规范

| 服务 | 消费组 | 订阅主题 |
|---|---|---|
| ingest | apiscloud-ingest | events.commands |
| data-writer | apiscloud-data-writer | telemetry.raw, telemetry.aggregated, events.alerts |

**命名规则**：`apiscloud-{service}`。

**好处**：多实例部署时，同服务共享消费组，自动负载均衡。

### 变更六：主题测试

新增 `tests/messageBus.topics.test.ts`，锁定 4 个主题常量：

- 数量：4 个
- 命名：符合 `<域>.<子域>` 规范
- 4 个常量值精确匹配
- `ALL_TOPICS` 包含且无重复
- 域前缀分组正确

## 五、V3 修改

### 变更一：主题分层语义明确

**为什么改：** 阶段五引入 aggregator 和多个插件，需要明确"哪些插件订阅哪层"。

**怎么改：** `topics.ts` 加分层注释：

| 层 | 主题 | 频率 | 保留 |
|---|---|---|---|
| 高频层 | telemetry.raw | 1-10Hz | 6h |
| 低频层 | telemetry.aggregated | 5s | 72h |
| 事件层 | events.commands、events.alerts | 事件驱动 | 7d |

**每个主题的语义：**

**telemetry.raw**
- 生产者：ingest（从 MQTT 转）
- 消费者：data-writer、dispatch-core、aggregator、route-optimizer
- 语义：单条原始数据，粒度最细，流量最大

**telemetry.aggregated**
- 生产者：aggregator
- 消费者：data-writer、charging-scheduler、dashboard
- 语义：区域级聚合，车辆数、平均速度、低电量车辆列表
- 设计意图：插件默认订阅此层，不订阅 raw，避免高频压垮插件

**events.commands**
- 生产者：dispatch-core、charging-scheduler、route-optimizer
- 消费者：ingest（转发 MQTT）、data-writer（审计）
- 语义：平台下发给外部系统的指令

**events.alerts**
- 生产者：geofence、anomaly
- 消费者：data-writer（落库 + Redis）
- 语义：异常、围栏越界、电量骤降等告警

**订阅策略：**

- 新插件默认订阅 `telemetry.aggregated`，不订阅 `telemetry.raw`。
- 只有确实需要单条原始数据的插件（如 route-optimizer）才订阅 raw。
- 插件通过 `plugin.json` 的 `topics.filter` 声明过滤条件，减少无效调用。

**影响：** 不改代码，只加注释。

### 变更二：插件过滤机制

**为什么改：** 减少 plugin-host 的无效调用。

**怎么改：** `plugin.json` 的 `topics` 加 `filter`：

```json
{
  "topics": {
    "subscribe": ["telemetry.raw"],
    "publish": ["events.commands"],
    "filter": {
      "field": "status",
      "equals": "running"
    }
  }
}
```

**filter 支持两种模式：**

| 模式 | 用途 | 示例 |
|---|---|---|
| `equals` | 等值匹配 | `{ field: "status", equals: "running" }` |
| `in` | 成员匹配 | `{ field: "status", in: ["running", "idle"] }` |

**`field` 支持点分路径：**

- `field: "status"` → `payload.status`
- `field: "position.lat"` → `payload.position.lat`

**plugin-host 的实现：**

```ts
// host.ts 的 dispatchMessage 里
const filter = manifest.topics?.filter;
if (filter && !matchesFilter(envelope, filter)) continue;
```

`matchesFilter` 从 payload 取 field 值，和 `equals` / `in` 比较。

**示例：** route-optimizer 声明 `filter: { field: "status", equals: "running" }`：

- `idle` 车的消息在 host 层被拦截，不进入插件的 `onMessage`。
- 减少无效调用，节省 CPU。

**影响：** 兼容旧插件，filter 是可选字段。

### 变更三：共享消费者组

**为什么改：** 多个插件订阅同一主题时，避免每个插件占一个消费者组。

**怎么改：** gateway 用单一消费者组 `apiscloud-gateway`：

- 从 `host.getSubscribedTopics()` 拿所有已激活插件关心的主题。
- 一次订阅，收到后 `dispatchMessage` 分发给各插件。

**对比：**

| 模式 | 消费者组数 |
|---|---|
| 每插件一个组 | N 个（N = 插件数） |
| gateway 单组 | 1 个 |

**gateway 的关键代码：**

```ts
// gateway/src/service.ts
async function subscribeToPluginTopics(): Promise<void> {
  const topics = pluginHost.getSubscribedTopics();

  for (const topic of topics) {
    const sub = await bus.subscribe(
      topic,
      async (env) => {
        await pluginHost.dispatchMessage(topic, env);
      },
      { groupId: 'apiscloud-gateway' },
    );
    subscriptions.push(sub);
  }
}
```

**收益：** Kafka 场景下，10 个插件只有 1 个消费者组，而不是 10 个。

**注意：** 这个方案下，同一插件组的多个 gateway 实例会负载均衡（正常）；但一个 gateway 内的多个插件都能收到消息（因为 `dispatchMessage` 是广播）。

### 变更四：懒订阅

**为什么改：** `dashboard` 这类纯前端插件没有订阅主题，不应占消费者名额。

**怎么改：** `PluginHost` 加 `activated` 集合：

- `lazy: false` → 始终激活。
- `lazy: true` 且有订阅主题 → 激活。
- `lazy: true` 且无订阅主题 → 不激活。

`dispatchMessage` 跳过未激活插件。

**`PluginHost` 新增 3 个方法：**

| 方法 | 作用 |
|---|---|
| `activatePlugin(name)` | 手动激活插件，返回 boolean |
| `isActivated(name)` | 查询插件是否已激活 |
| `getSubscribedTopics()` | 返回所有已激活插件订阅的主题集合 |

**场景示例：**

| 插件 | lazy | subscribe | 激活 |
|---|---|---|---|
| geofence | true | ["telemetry.raw"] | ✅ |
| charging-scheduler | true | ["telemetry.aggregated"] | ✅ |
| dashboard | true | [] | ❌（纯前端） |
| example-plugin | true | [] | ❌（示例） |

**运行时手动激活：**

```ts
host.activatePlugin('dashboard');
// → true，dashboard 从"未激活"变为"已激活"
```

**影响：** 兼容旧插件，未指定 lazy 时默认 `true`。

### 变更五：按车辆分区

**为什么改：** 同一车辆的消息需要保证顺序。

**怎么改：** `partitionKey = vehicle_id` 已在多个服务里应用：

| 服务 | 发布主题 | partitionKey |
|---|---|---|
| ingest | telemetry.raw | vehicle_id |
| dispatch-core | events.commands | vehicle_id |
| charging-scheduler | events.commands | vehicle_id |
| route-optimizer | events.commands | vehicle_id |
| aggregator | telemetry.aggregated | region |

**Kafka 场景：**

- 同一车辆的消息落到同一分区，保证顺序。
- 消费者按车辆维度并行处理，不会跨车乱序。

**Memory 场景：**

- partitionKey 被忽略。
- 行为不受影响。

**测试：** `tests/messageBus.partition.test.ts` 锁定这个行为。

### 变更六：批量消费（预留）

**为什么改：** 未来数据量大时，逐条消费可能不够。

**怎么改：** `SubscribeOptions` 加 `batchSize?`：

```ts
interface SubscribeOptions {
  groupId?: string;
  filter?: (env: Envelope) => boolean;
  partitionKey?: string;
  batchSize?: number;   // 阶段五预留
}
```

**当前状态：** KafkaAdapter 仍用 `eachMessage` 逐条消费。

**未来实现：**

- `batchSize > 1` 时用 `eachBatch`。
- `autoCommit: false`，批量处理完后手动提交位点。
- 收益：吞吐提升 5-10 倍。

### 变更七：总线切换验证

**为什么改：** 验证"业务代码只依赖 MessageBus 接口"。

**怎么改：** 加 `tests/messageBus.switchVerification.test.ts`：

- 定义一个只接受 `MessageBus` 接口的业务函数。
- 用 `MemoryAdapter` 跑通。
- 用 `createMessageBus(config)` 按配置返回不同适配器。
- 验证同一套业务代码在不同适配器上行为一致。

**收益：** 总线切换能力得到自动化测试保障。

## 六、后续版本

### 阶段六计划

- **事务、精确一次、全局有序**：媒介特有能力的边界处理。
  - 抽象层不暴露事务，特殊需求直接用原生 SDK。
  - 精确一次降级为至少一次 + 去重。
  - 全局有序不承诺。
- **Pulsar / NATS / Redis 适配器**：
  - Pulsar：存算分离，扩展性更强。
  - NATS：微秒级，适合低延迟。
  - Redis Pub/Sub：实时性 < 50ms 的场景。
- **批量消费真正实现**：
  - KafkaAdapter 用 `eachBatch`。
  - 加 `max.poll.records` 配置。
- **共享消费者组的进一步优化**：
  - 相似插件分到子组。
  - 跨 gateway 实例的负载均衡策略。

### 长期演进

- **消息压缩**：大批量消息时启用 gzip / snappy。
- **死信队列**：处理失败的消息进入 DLQ。
- **消息追踪**：集成 OpenTelemetry，全链路追踪。
- **Schema Registry**：契约版本化管理。
- **多集群路由**：跨集群消息路由与一致性。
- **按业务分集群**：遥测一个集群，告警一个集群，命令一个集群。
- **冷热分层**：热路径走 Redis Pub/Sub，温路径走 Kafka，冷路径走 S3/MinIO。

### 参考：四层递进方案（问答第 8、15 个问题）

**Kafka 压力四层递进解决：**

| 层次 | 方案 | 方便度 | 是否改核心契约 |
|---|---|---|---|
| 第一层 | 消费侧优化：消费者合并、批量处理、异步提交、限流、多线程 | 方便 | 不改 |
| 第二层 | 状态查询移出 Kafka：Redis 热路径、PG 只读副本、本地缓存、CQRS | 中等 | 不改 |
| 第三层 | 消息总线分片：按业务、区域、优先级分集群 | 不方便 | 不改，但改部署 |
| 第四层 | 换总线或引入新总线：Pulsar、NATS、Redis Pub/Sub、S3、MQTT | 部分方便 | 不改 |

**关键：四层都不需要改核心契约，按需启动。**

**当前落地情况：**

- 第一层：`batchSize` 预留，未实现。
- 第二层：Redis 热路径已实现（data-writer 写、reporting 读）。
- 第三层：未做（需多集群）。
- 第四层：换总线方便（抽象层已预留），引入新总线中等。