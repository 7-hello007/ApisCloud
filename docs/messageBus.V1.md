# 消息总线抽象层 V1

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

## 四、后续版本

- 阶段五：消息总线性能优化（主题分层、选择性订阅、共享消费者组、批量消费、按 vehicle_id 分区）
- 阶段五：扩展 Pulsar、NATS、Redis 适配器
- 阶段五：跨集群多实例支持
- 阶段六：事务、精确一次、全局有序等媒介特有能力的边界处理