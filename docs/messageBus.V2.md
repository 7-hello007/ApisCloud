# 消息总线抽象层 V2

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

## 五、后续版本

- 阶段五：批量消费优化（max.poll.records）
- 阶段五：共享消费者组，减少扇出
- 阶段五：按业务分集群、按区域分集群
- 阶段五：扩展 Pulsar、NATS、Redis 适配器
- 阶段六：事务、精确一次、全局有序等媒介特有能力的边界处理

---