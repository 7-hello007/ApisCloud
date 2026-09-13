# 聚合器 V1

## 一、功能目标

aggregator 是**核心服务**，消费 `telemetry.raw`（高频），按时间窗聚合成 `telemetry.aggregated`（低频），供下游插件消费。

**定位：**

- 核心服务，冻结维护
- 订阅 `telemetry.raw`，发布 `telemetry.aggregated`
- 不连 MQTT，不连 PG/Redis
- 独立启动，不走 plugin-host
- 暴露 `/metrics`、`/health`，端口 9108
- 消费者组 `apiscloud-aggregator`

**为什么是核心服务不是插件：**

- 所有下游插件（charging-scheduler、dashboard）都依赖 `telemetry.aggregated`。
- 聚合是基础能力，不是可选。
- 符合"核心稳定冻结，插件自由迭代"原则。

**数据流：**

```
telemetry.raw (1Hz) ──→ aggregator ──→ telemetry.aggregated (5s 一次)
                            │
                            └─ 内部维护 Map<vehicle_id, VehicleState>
                            └─ 按 windowMs 聚合
                            └─ 输出 avg_speed、avg_battery、low_battery_vehicles、idle_vehicles
```

**核心规则：**

- 服务之间零直接调用，只通过消息总线。
- 同一车辆在一个窗口内只保留最新一条遥测。
- 聚合结果按 region 分区（`partitionKey = region`）。
- 聚合是纯函数，方便单测。

## 二、基础实现

### 2.1 文件位置

```
core/services/aggregator/
├── package.json
├── tsconfig.json
├── plugin.json
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts
    ├── config.ts
    ├── window.ts
    ├── aggregator.ts
    ├── mapper.ts
    └── service.ts
```

### 2.2 依赖

- `@apiscloud/libs`：配置、日志、健康、指标
- `@apiscloud/message-bus`：统一总线接口、信封、主题常量
- `@apiscloud/observability`：可观测性服务，暴露 `/metrics` 和 `/health`

不直接引 kafkajs，统一走 message-bus 抽象层。

### 2.3 数据模型

**输入 `TelemetryRawPayload`：**

| 字段 | 说明 |
|---|---|
| vehicle_id | 车辆唯一标识 |
| ts | 毫秒时间戳 |
| lat / lng | 经纬度 |
| speed | 速度 km/h |
| battery | 电量 0-100 |
| heading | 航向 0-360 |
| status | idle / running / charging / maintenance / offline |

**输出 `AggregatedPayload`：**

| 字段 | 说明 |
|---|---|
| region | 区域标识 |
| window_start / window_end | 时间窗起止（毫秒时间戳） |
| vehicle_count | 车辆数 |
| avg_speed | 平均速度 |
| avg_battery | 平均电量 |
| low_battery_vehicles | 低电量车辆 ID 列表（battery < threshold） |
| idle_vehicles | 空闲车辆 ID 列表（status = idle） |
| region_center | 区域中心 { lat, lng } |

**扩展字段说明：**

`low_battery_vehicles` 和 `idle_vehicles` 是阶段五新增的，专门为下游插件设计：

- `charging-scheduler` 从 `low_battery_vehicles` 拿候选，不需要自己维护车辆状态。
- 未来 dashboard、其他插件也可以直接用这些字段。
- 这样避免下游插件重新消费 `telemetry.raw` 做筛选。

### 2.4 配置项

从环境变量读取，全部有默认值：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| AGGREGATOR_PORT | 9108 | HTTP 端口 |
| AGGREGATOR_WINDOW_MS | 5000 | 聚合窗口毫秒数 |
| AGGREGATOR_CONSUMER_GROUP | apiscloud-aggregator | 总线消费组 |
| AGGREGATOR_LOW_BATTERY_THRESHOLD | 20 | 低电量阈值（%） |
| AGGREGATOR_REGION | global | 区域标识 |
| AGGREGATOR_REGION_CENTER_LAT | 31.2304 | 区域中心纬度 |
| AGGREGATOR_REGION_CENTER_LNG | 121.4737 | 区域中心经度 |

非法值启动即失败，避免静默错误。

### 2.5 时间窗管理

`AggregationWindow` 类，用 `Map<vehicle_id, TelemetryRawPayload>` 累积最新状态。

**核心方法：**

| 方法 | 作用 |
|---|---|
| `push(payload)` | 写入或更新一条遥测，同一车辆只保留最新一条 |
| `drain()` | 返回当前窗口内的所有快照，并清空缓冲 |
| `size()` | 当前缓存条数 |
| `clear()` | 清空缓冲，不返回数据 |

**为什么用 Map：**

- 同一车辆在一个窗口内可能上报多次（如 1Hz × 5s = 5 条）。
- 只保留最新一条，避免重复计算。
- 内存不会随窗口数增长（每窗口清空）。

### 2.6 聚合算法

`aggregate` 纯函数，无副作用。

**输入：**

```ts
interface AggregateInput {
  snapshots: TelemetryRawPayload[];
  windowStart: number;
  windowEnd: number;
  region: string;
  regionCenter: { lat: number; lng: number };
  lowBatteryThreshold: number;
}
```

**输出：** `AggregatedPayload`

**处理流程：**

1. 空列表：返回 `vehicle_count: 0`，所有数组为空。
2. 非空：遍历快照，累加 `speed` 和 `battery`，识别 `low_battery_vehicles` 和 `idle_vehicles`。
3. 计算 `avg_speed` 和 `avg_battery`，四舍五入到 2 位小数。

**为什么是纯函数：**

- 输入输出确定，方便单测。
- 没有副作用，不依赖外部状态。
- 可以任意次数调用，结果一致。

### 2.7 映射逻辑

**`extractTelemetryRaw`：** 从 `Envelope` 提取 payload，直接 `env.payload as TelemetryRawPayload`。

**`aggregatedToEnvelope`：** 用 `createEnvelope` 包装聚合结果：

```ts
createEnvelope({
  topic: TOPICS.TELEMETRY_AGGREGATED,
  source: 'aggregator',
  payload,
});
```

信封自动生成 `id`、`trace_id`、`span_id`。

### 2.8 服务组合

`createAggregatorService` 组合：

- 配置：`loadAggregatorConfig`
- 时间窗：`AggregationWindow`
- 总线：`createMessageBus`
- 可观测性：`createObservabilityService`

**可注入依赖**：`bus`、`window` 可通过 options 覆盖，便于单元测试。

**启动流程：**

1. 连接总线
2. 启动 HTTP 服务器
3. 订阅 `telemetry.raw`，回调 `onTelemetryRaw`（累积到窗口）
4. 启动定时器，按 `windowMs` 周期触发 `flush`
5. 注册健康检查：`bus`、`window`

**停止流程：**

1. 清定时器
2. 取消所有总线订阅
3. 关闭总线
4. 停止 HTTP 服务器

### 2.9 手动 flush

`service.flush()` 手动触发一次聚合，不依赖定时器。用于：

- 单元测试
- 运维手动触发
- 未来可以加 HTTP 端点触发

### 2.10 异常处理

- **遥测处理失败**：记 error，跳过该条。
- **聚合发布失败**：记 error，不阻塞下个窗口。
- **`stop` 幂等**：重复调用不会报错。

### 2.11 健康检查

`/health` 返回检查项：

| 检查项 | 说明 |
|---|---|
| self | 可观测性服务自身 |
| bus | 总线健康状态 |
| window | 当前窗口缓存条数 |

### 2.12 指标

复用可观测性服务的指标集：

- `apiscloud_dataflow_messages_total{topic="telemetry.aggregated",direction="out"}`：发出的聚合消息数
- `apiscloud_http_requests_total`：HTTP 请求数
- `apiscloud_http_request_duration_seconds`：HTTP 延迟
- Prometheus 默认指标

### 2.13 独立启动

命令：

```bash
node dist/server-entry.js
```

环境变量：

- `AGGREGATOR_PORT` 覆盖端口，默认 9108

支持 SIGTERM、SIGINT 优雅关闭。

### 2.14 监控集成

`monitor/prometheus/prometheus.yml` 已含 aggregator target：`host.docker.internal:9108`。

Grafana 可通过 Prometheus 数据源看到 aggregator 指标。

### 2.15 完整数据流

```
simulator ──MQTT──→ EMQX ──→ ingest ──→ telemetry.raw
                                              │
                                              ├──→ data-writer → PG/Redis
                                              ├──→ dispatch-core → events.commands
                                              ├──→ route-optimizer（插件）→ events.commands
                                              └──→ aggregator ──→ telemetry.aggregated
                                                                       │
                                                                       ├──→ data-writer → Redis 区域统计
                                                                       └──→ charging-scheduler（插件）→ events.commands
```

### 2.16 与下游插件的关系

**charging-scheduler：**

- 订阅 `telemetry.aggregated`。
- 从 `low_battery_vehicles` 拿候选。
- 不需要自己维护车辆状态。
- 不需要消费 `telemetry.raw`。

**dashboard（未来）：**

- 从聚合数据拿车辆数、平均速度等统计。
- 不直接消费原始遥测。

**设计意图：**

- 高频数据（raw）由核心服务处理。
- 插件默认订阅低频数据（aggregated）。
- 减少插件对消息总线的压力。

## 三、V1 修改

无（首版）。

## 四、后续版本

### 计划中的 V2

- 可配置聚合维度：按区域、按车队、按车型。
- 支持多区域并行聚合，每个区域一个聚合窗口。
- 滑动窗口（每秒计算，窗口长度 5s）。

### 计划中的 V3

- 聚合结果落 PG 聚合表，支持历史查询。
- 聚合结果写 Redis 热路径，供插件 O(1) 读。
- 支持时间序列聚合（每分钟、每小时、每天）。

### 计划中的 V4

- 分片聚合：按车辆 ID 哈希分片，多个 aggregator 实例。
- 分布式窗口一致性。
- 聚合结果交叉校验。

### 长期演进

- 流式聚合（Kafka Streams / Flink 风格）。
- 复杂事件处理（CEP）。
- 机器学习预测（需求预测、供给平衡）。
- 跨区域聚合。

### 注意事项

- **聚合窗口不能太小**：太小则消息频繁，压总线。
- **聚合窗口不能太大**：太大则延迟高，插件反应慢。
- **默认 5s** 是折中，按业务调整。
- **低电量阈值** 可按季节、车型、任务类型动态调整。
- **窗口内的车辆状态** 是最终值，不记录历史轨迹。