# MQTT 出入口 V1

## 一、功能目标

ingest 是系统**唯一的外部出入口**，负责外部自动驾驶系统与内部消息总线之间的双向协议转换。

**上行**：订阅 MQTT `telemetry/raw`，校验数据合法性，包装成统一信封，发布到总线 `telemetry.raw`。

**下行**：订阅总线 `events.commands`，校验命令合法性，转换为 MQTT payload，发布到 `commands/{vehicle_id}`。

ingest 的定位：

- 唯一连外部的服务（通过 MQTT）
- 只做协议转换和输入校验，不做业务逻辑
- 不直接写库
- 独立启动，不走 plugin-host
- 暴露 `/metrics` 和 `/health`
- 数据流方向：EMQX → ingest → 消息总线 → data-writer

关键规则：

- 只有 ingest 连外部，其他服务不碰 MQTT
- 服务之间零直接调用，只通过消息总线
- 输入必须校验，非法数据丢弃并记录
- 总线发布按 `vehicle_id` 分区，保证同车消息顺序

## 二、基础实现

### 2.1 文件位置

```
core/services/ingest/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts
    ├── config.ts
    ├── validation.ts
    ├── mapper.ts
    ├── mqtt-subscriber.ts
    ├── mqtt-publisher.ts
    ├── bus-publisher.ts
    ├── bus-subscriber.ts
    └── service.ts
```

### 2.2 依赖

- `@apiscloud/libs`：配置、日志、健康、MQTT 封装、指标、输入校验 schema
- `@apiscloud/message-bus`：统一总线接口、信封、主题常量
- `@apiscloud/observability`：可观测性服务，暴露 `/metrics` 和 `/health`
- `zod`：定义上行/下行 payload schema

### 2.3 数据模型

**上行遥测 `UplinkTelemetry`**：

| 字段 | 说明 |
|---|---|
| vehicle_id | 车辆唯一标识 |
| ts | 毫秒时间戳 |
| lat / lng | 经纬度 |
| speed | 速度 km/h |
| battery | 电量 0-100 |
| heading | 航向 0-360 |
| status | idle / running / charging / maintenance / offline |

**下行命令 `DownlinkCommand`**：

| 字段 | 说明 |
|---|---|
| vehicle_id | 目标车辆 |
| command_id | 命令唯一标识，用于幂等 |
| command_type | 命令类型，如 dispatch / cancel / charge |
| payload | 命令数据，结构随 command_type 变化 |

### 2.4 配置项

从环境变量读取，全部有默认值：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| INGEST_MQTT_TOPIC | telemetry/raw | MQTT 上行订阅主题 |
| INGEST_MQTT_COMMAND_PREFIX | commands/ | MQTT 下行主题前缀 |
| INGEST_CONSUMER_GROUP | apiscloud-ingest | 总线消费组 |
| INGEST_PORT | 9103 | HTTP 端口 |

### 2.5 上行流程

```
MQTT 消息（Buffer）
  ↓
1. JSON.parse，失败丢弃
2. UplinkTelemetrySchema 校验，失败丢弃并 warn
3. telemetryToEnvelope 包装为 Envelope
   - topic: telemetry.raw
   - source: ingest
   - trace_id / span_id 自动生成
4. busPublisher.publish，partitionKey = vehicle_id
5. metrics.dataFlowMessages.inc({ topic: telemetry.raw, direction: in })
```

### 2.6 下行流程

```
总线 Envelope
  ↓
1. DownlinkCommandSchema 校验 env.payload，失败丢弃并 warn
2. envelopeToCommand 提取命令
3. mqttTopic = commands/{vehicle_id}
4. mqttPublisher.publish(mqttTopic, cmd)
5. metrics.dataFlowMessages.inc({ topic: events.commands, direction: out })
```

### 2.7 输入校验

**上行遥测 schema**：

| 字段 | 校验规则 |
|---|---|
| vehicle_id | 非空、最长 128 |
| ts | 正整数 |
| lat | -90 到 90 |
| lng | -180 到 180 |
| speed | 0 到 500 |
| battery | 0 到 100 |
| heading | 0 到 360 |
| status | 枚举五选一 |

**下行命令 schema**：

| 字段 | 校验规则 |
|---|---|
| vehicle_id | 非空 |
| command_id | 非空，最长 128 |
| command_type | 非空，最长 64 |
| payload | 任意类型 |

复用 `@apiscloud/libs` 的 `VehicleId`、`Latitude`、`Longitude`、`Battery` schema。

### 2.8 映射逻辑

**`telemetryToEnvelope`**：

- 输入：`UplinkTelemetry`
- 输出：`Envelope<UplinkTelemetry>`
- 固定 topic = `TOPICS.TELEMETRY_RAW`
- 固定 source = `'ingest'`
- trace_id / span_id 自动生成

**`envelopeToCommand`**：

- 输入：`Envelope`
- 输出：`DownlinkCommand`
- 直接取 `env.payload`，不做字段转换

### 2.9 MQTT 订阅器

`createMqttSubscriber(config)` 返回：

| 方法 | 作用 |
|---|---|
| connect | 连接 EMQX |
| subscribe(topic, handler) | 订阅 topic，QoS 1 |
| health | 健康检查 |
| close | 关闭连接 |

handler 只接收 `Buffer`，topic 由订阅时确定。

### 2.10 MQTT 发布器

`createMqttPublisher(config)` 返回：

| 方法 | 作用 |
|---|---|
| connect | 连接 EMQX |
| publish(topic, payload) | 发布消息，自动 JSON 序列化，QoS 1 |
| health | 健康检查 |
| close | 关闭连接 |

**订阅器和发布器独立连接**：避免订阅和发布互相影响，也便于分别关闭。

### 2.11 总线发布器

`createBusPublisher(bus)` 返回：

| 方法 | 作用 |
|---|---|
| publish(topic, env, partitionKey) | 发布 Envelope 到总线 |

`partitionKey` 缺省用 `env.source`，遥测场景显式传 `vehicle_id`。

### 2.12 总线订阅器

`createBusSubscriber(bus)` 返回：

| 方法 | 作用 |
|---|---|
| subscribe(topic, groupId, handler) | 订阅总线主题 |

返回 `Subscription`，便于优雅关闭时 `unsubscribe`。

### 2.13 服务组合

`createIngestService` 组合：

- 配置：`loadIngestConfig`
- 总线：`createMessageBus`
- MQTT 订阅器：`createMqttSubscriber`
- MQTT 发布器：`createMqttPublisher`
- 总线发布器：`createBusPublisher`
- 总线订阅器：`createBusSubscriber`
- 可观测性：`createObservabilityService`

**可注入依赖**：`mqttSubscriber`、`mqttPublisher`、`bus` 都可通过 options 覆盖，便于单元测试。

启动流程：

1. 连接总线
2. 连接 MQTT 订阅器
3. 连接 MQTT 发布器
4. 启动 HTTP 服务器
5. 订阅 MQTT `telemetry/raw`，回调 `handleUplink`
6. 订阅总线 `events.commands`，消费组 `apiscloud-ingest`，回调 `handleDownlink`
7. 注册健康检查：mqtt、bus

停止流程：

1. 取消所有总线订阅
2. 关闭 MQTT 订阅器
3. 关闭 MQTT 发布器
4. 关闭总线
5. 停止 HTTP 服务器

### 2.14 异常处理

- **每条消息独立 try/catch**：一条失败不影响下一条
- **上行 JSON 解析失败**：记录 warn，丢弃
- **上行校验失败**：记录 warn，附 issues，丢弃
- **总线发布失败**：记录 error
- **下行校验失败**：记录 warn，丢弃
- **MQTT 发布失败**：记录 error

### 2.15 健康检查

`/health` 返回三个检查项：

| 检查项 | 说明 |
|---|---|
| self | 可观测性服务自身 |
| mqtt | MQTT 订阅器连接状态 |
| bus | 总线健康状态，含订阅数 |

### 2.16 指标

复用可观测性服务的指标集：

- `apiscloud_dataflow_messages_total{topic="telemetry.raw",direction="in"}`：上行消息数
- `apiscloud_dataflow_messages_total{topic="events.commands",direction="out"}`：下行消息数
- `apiscloud_http_requests_total`：HTTP 请求数
- `apiscloud_http_request_duration_seconds`：HTTP 延迟
- Prometheus 默认指标

### 2.17 独立启动

命令：

```bash
node dist/server-entry.js
```

环境变量：

- `INGEST_PORT` 覆盖端口，默认 9103

支持 SIGTERM、SIGINT 优雅关闭。

### 2.18 监控集成

`monitor/prometheus/prometheus.yml` 已含 ingest target：`host.docker.internal:9103`。

Grafana 可通过 Prometheus 数据源看到 ingest 指标。

## 三、V1 修改

无（首版）。

## 四、后续版本

- 阶段三：支持 gRPC / HTTP 协议接入
- 阶段三：支持下行命令签名校验
- 阶段四：网关动态路由注入，ingest 管理端点暴露
- 阶段五：批量消费、共享消费者组、按 vehicle_id 分区优化
- 阶段六：限流和防重放替换为 Redis 版