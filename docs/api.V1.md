# API 文档 V1

## 一、功能目标

集中描述 ApisCloud 的所有对外接口：HTTP API、MQTT 主题、消息总线主题、消息格式。

---

## 二、HTTP API

### 2.1 Gateway 管理端点

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| GET | `/health` | 健康检查 | 白名单 |
| GET | `/metrics` | Prometheus 指标 | 白名单 |
| GET | `/api/registry` | 插件清单 | 白名单 |

#### GET /health

**响应：**

```json
{
  "status": "ok",
  "service": "gateway",
  "timestamp": "2026-09-14T01:00:54.354Z",
  "checks": {
    "self": { "status": "ok", "message": "gateway running" },
    "bus": { "status": "ok" },
    "plugin-host": { "status": "ok", "message": "anomaly,charging-scheduler,..." },
    "proxiedServices": { "status": "ok", "message": "ingest,data-writer,dispatch-core" }
  }
}
```

**状态码：** `200` / `503`（down 时）

#### GET /metrics

**响应：** Prometheus 文本格式。

**关键指标：**

```
apiscloud_http_requests_total{method, path, status, service}
apiscloud_http_request_duration_seconds{method, path, service}
apiscloud_dataflow_messages_total{topic, direction, service}
apiscloud_dataflow_latency_seconds{topic, service}
apiscloud_plugin_actions_total{plugin, action, success, service}
apiscloud_plugin_action_duration_seconds{plugin, action, service}
apiscloud_bus_published_total{topic, service}
apiscloud_bus_consumed_total{topic, group, service}
apiscloud_bus_consumer_lag{topic, group, service}
apiscloud_dispatch_tasks_total{task_type, algorithm, result, service}
apiscloud_plugin_dispatch_total{plugin, topic, service}
apiscloud_charging_commands_total{command_type, result, service}
apiscloud_geofence_events_total{event_type, level, service}
apiscloud_anomaly_events_total{alert_type, level, service}
```

#### GET /api/registry

**响应：**

```json
{
  "version": "1",
  "profile": "core",
  "proxiedServices": [
    { "name": "ingest", "prefix": "/api/proxy/ingest" },
    { "name": "data-writer", "prefix": "/api/proxy/data-writer" },
    { "name": "dispatch-core", "prefix": "/api/proxy/dispatch-core" }
  ],
  "plugins": [
    {
      "name": "dashboard",
      "version": "1.0.0",
      "core": false,
      "profile": ["core", "full"],
      "lazy": true,
      "topics": { "subscribe": [], "publish": [] },
      "frontend": "dashboard",
      "activated": true
    }
  ],
  "byProfile": {
    "core": ["anomaly", "dashboard", "geofence", "..."],
    "full": ["..."]
  },
  "subscribedTopics": ["telemetry.raw", "telemetry.aggregated"]
}
```

---

### 2.2 Gateway 反向代理

**前缀：** `/api/proxy/{service}/...`

**已配置的 service：**

| service | 目标 | 说明 |
|---|---|---|
| `ingest` | `http://localhost:9103` | MQTT 出入口 |
| `data-writer` | `http://localhost:9104` | 统一写库 |
| `dispatch-core` | `http://localhost:9105` | 调度核心 |

**示例：**

```bash
curl http://localhost:9101/api/proxy/data-writer/health
# → 转发到 http://localhost:9104/health
```

---

### 2.3 Data-Writer 查询端点

通过 gateway 反向代理访问：

| 方法 | 完整路径 | 说明 |
|---|---|---|
| GET | `/api/proxy/data-writer/api/query/vehicles/active` | 活跃车辆列表 |
| GET | `/api/proxy/data-writer/api/query/vehicles/{id}` | 单车详情 |
| GET | `/api/proxy/data-writer/api/query/alerts/recent` | 最近告警 |
| GET | `/api/proxy/data-writer/api/query/commands/recent` | 最近指令 |

#### GET /api/query/vehicles/active

**响应：**

```json
{
  "count": 2,
  "vehicles": [
    {
      "vehicle_id": "v-000001",
      "status": "running",
      "battery": 80.5,
      "lat": 31.2304,
      "lng": 121.4737,
      "heading": 90,
      "speed": 30.2,
      "updated_at": "2026-09-14T01:00:00.000Z"
    }
  ]
}
```

#### GET /api/query/alerts/recent

**响应：**

```json
{
  "count": 1,
  "alerts": [
    {
      "vehicle_id": "v-000001",
      "alert_type": "geofence_exit",
      "level": "warning",
      "message": "车辆 v-000001 离开围栏「上海运营区域」",
      "created_at": "2026-09-14T01:00:00.000Z"
    }
  ]
}
```

#### GET /api/query/commands/recent

**响应：**

```json
{
  "count": 1,
  "commands": [
    {
      "command_id": "cmd-uuid",
      "vehicle_id": "v-000001",
      "task_id": "task-1",
      "command_type": "dispatch",
      "status": "pending",
      "issued_at": "2026-09-14T01:00:00.000Z"
    }
  ]
}
```

---

### 2.4 Reporting 插件路由

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/reporting/summary` | 组合报表 |
| GET | `/api/reporting/vehicles` | 车辆列表 + 汇总 |
| GET | `/api/reporting/alerts` | 告警列表 + 汇总 |

#### GET /api/reporting/summary

**响应：**

```json
{
  "generated_at": "2026-09-14T01:00:00.000Z",
  "vehicles": {
    "total": 500,
    "byStatus": { "running": 300, "idle": 200 },
    "avgBattery": 65.5,
    "lowBatteryCount": 45
  },
  "alerts": {
    "total": 10,
    "byLevel": { "warning": 8, "critical": 2 },
    "byType": { "geofence_exit": 6, "battery_drop": 4 }
  },
  "commands": {
    "total": 65,
    "byType": { "charge": 65 },
    "byStatus": { "pending": 65 }
  }
}
```

---

### 2.5 认证

**当 `GATEWAY_AUTH_ENABLED=true` 时：**

- 白名单：`/health`、`/metrics`、`/api/registry`
- 其他路径：`Authorization: Bearer <jwt>`

**未认证响应：**

```json
{
  "error": "unauthorized",
  "reason": "missing or invalid token"
}
```

**状态码：** `401`

---

### 2.6 限流

**默认启用：** 每 IP 每分钟 100 次。

**白名单：** `/health`、`/metrics`。

**响应头：**

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1789303099
```

**超限响应：**

```json
{
  "error": "too_many_requests",
  "retry_after_sec": 45
}
```

**状态码：** `429`

---

## 三、MQTT 主题

### 3.1 上行（外部 → 平台）

| 主题 | QoS | 说明 | 频率 |
|---|---|---|---|
| `telemetry/raw` | 1 | 车辆状态上报 | 1-10Hz |
| `heartbeat/{vehicle_id}` | 0 | 心跳 | 10-60s |

**`telemetry/raw` payload：**

```json
{
  "vehicle_id": "v-000001",
  "ts": 1789303000000,
  "lat": 31.2304,
  "lng": 121.4737,
  "speed": 30,
  "battery": 80,
  "heading": 90,
  "status": "running"
}
```

**`status` 取值：**

| 值 | 说明 |
|---|---|
| `idle` | 空闲 |
| `running` | 行驶中 |
| `charging` | 充电中 |
| `maintenance` | 维护中 |
| `offline` | 离线 |

### 3.2 下行（平台 → 外部）

| 主题 | QoS | 说明 |
|---|---|---|
| `commands/{vehicle_id}` | 1 | 调度指令 |

**`commands/{vehicle_id}` payload：**

```json
{
  "vehicle_id": "v-000001",
  "command_id": "cmd-uuid",
  "command_type": "dispatch",
  "payload": {
    "task_id": "task-1",
    "task_type": "passenger",
    "origin": { "lat": 31.2304, "lng": 121.4737 },
    "destination": { "lat": 31.5, "lng": 121.8 },
    "issued_at": 1789303000,
    "signed": {
      "command": { "...": "..." },
      "signature": "hmac-sha256-hex",
      "algorithm": "sha256"
    }
  }
}
```

**`command_type` 取值：**

| 值 | 说明 |
|---|---|
| `dispatch` | 调度指令 |
| `cancel` | 取消指令 |
| `charge` | 充电指令 |
| `maintenance` | 维护指令 |
| `rescue` | 救援指令 |

---

## 四、消息总线主题

| 主题 | 分区数 | 保留 | 生产者 | 消费者 |
|---|---|---|---|---|
| `telemetry.raw` | 6 | 6h | ingest | data-writer、dispatch-core、aggregator、gateway |
| `telemetry.aggregated` | 3 | 72h | aggregator | data-writer、gateway |
| `events.commands` | 3 | 7d | dispatch-core、charging-scheduler、route-optimizer | ingest、data-writer |
| `events.alerts` | 3 | 7d | geofence、anomaly | data-writer |

### 4.1 消费者组

**复合 groupId：** `<base>--<topic 去点>`

| 服务 | 基础 base | 订阅主题 | 实际 groupId |
|---|---|---|---|
| data-writer | `apiscloud-data-writer` | telemetry.raw | `apiscloud-data-writer--telemetry-raw` |
| data-writer | `apiscloud-data-writer` | telemetry.aggregated | `apiscloud-data-writer--telemetry-aggregated` |
| data-writer | `apiscloud-data-writer` | events.alerts | `apiscloud-data-writer--events-alerts` |
| data-writer | `apiscloud-data-writer` | events.commands | `apiscloud-data-writer--events-commands` |
| gateway | `apiscloud-gateway` | telemetry.raw | `apiscloud-gateway--telemetry-raw` |
| gateway | `apiscloud-gateway` | telemetry.aggregated | `apiscloud-gateway--telemetry-aggregated` |
| ingest | `apiscloud-ingest` | events.commands | `apiscloud-ingest--events-commands` |
| dispatch-core | `apiscloud-dispatch-core` | telemetry.raw | `apiscloud-dispatch-core--telemetry-raw` |
| aggregator | `apiscloud-aggregator` | telemetry.raw | `apiscloud-aggregator--telemetry-raw` |

**为什么用复合 groupId：** Kafka 规定同一 groupId 的所有 member 必须订阅相同的 topic 集合。**同一服务订阅多个 topic 时，必须用不同 groupId。**

---

### 4.2 主题分层语义

| 层 | 主题 | 频率 | 保留 | 设计意图 |
|---|---|---|---|---|
| 高频层 | `telemetry.raw` | 1-10Hz | 6h | 单条原始数据，流量最大 |
| 低频层 | `telemetry.aggregated` | 5s | 72h | 区域级聚合，插件默认订阅 |
| 事件层 | `events.commands` | 事件驱动 | 7d | 平台下发指令 |
| 事件层 | `events.alerts` | 事件驱动 | 7d | 异常告警 |

**订阅策略：**

- 新插件默认订阅 `telemetry.aggregated`，不订阅 `telemetry.raw`。
- 只有确实需要单条原始数据的插件才订阅 `telemetry.raw`（如 route-optimizer）。
- 用 `plugin.json` 的 `topics.filter` 减少无效调用。

---

## 五、消息信封

**所有总线消息的统一结构：**

```json
{
  "id": "uuid",
  "topic": "telemetry.raw",
  "source": "ingest",
  "timestamp": 1789303000000,
  "trace_id": "trace-uuid",
  "span_id": "span-uuid",
  "version": "1.0",
  "payload": {}
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 消息唯一标识，自动生成 |
| `topic` | string | 主题名 |
| `source` | string | 来源服务 |
| `timestamp` | number | 毫秒时间戳，必须 ≤ 2^53-1 |
| `trace_id` | string | 追踪 ID，未提供时自动生成 |
| `span_id` | string | 跨度 ID，未提供时自动生成 |
| `version` | string | 契约版本，默认 `"1.0"` |
| `payload` | unknown | 业务数据 |

**注意：** `timestamp` 必须是 13 位毫秒时间戳，**不能用 `date +%s%3N`**（某些 shell 会输出 19 位纳秒，超过 JS `Number.MAX_SAFE_INTEGER`）。

---

## 六、WebSocket / SSE

**当前未实现。** 前端通过 5 秒轮询拉数据。

**阶段六之后：** 可加 WebSocket 或 SSE 实时推送。

---

## 七、错误响应

**统一格式：**

```json
{
  "error": "error_code",
  "message": "可选说明",
  "reason": "可选原因"
}
```

| 状态码 | error | 场景 |
|---|---|---|
| 400 | `bad_request` | 请求格式错误 |
| 401 | `unauthorized` | 未认证 |
| 404 | `not_found` | 资源不存在 |
| 429 | `too_many_requests` | 限流 |
| 500 | `internal_error` | 服务内部错误 |
| 502 | `bad_gateway` | 反向代理目标不可达 |
| 503 | `service_unavailable` | 服务降级 |

---

## 八、数据模型

### 8.1 车辆状态（VehicleState）

| 字段 | 类型 | 说明 |
|---|---|---|
| `vehicle_id` | string | 车辆唯一标识，格式 `v-NNNNNN` |
| `ts` | number | 毫秒时间戳 |
| `lat` | number | 纬度（-90 到 90） |
| `lng` | number | 经度（-180 到 180） |
| `speed` | number | 速度（0-500 km/h） |
| `battery` | number | 电量（0-100） |
| `heading` | number | 航向（0-360） |
| `status` | enum | 见 3.1 节 |

### 8.2 调度任务（DispatchTask）

| 字段 | 类型 | 说明 |
|---|---|---|
| `task_id` | string | 任务唯一标识 |
| `task_type` | enum | passenger / inspection / logistics / charging / maintenance / rescue |
| `origin` | GeoPoint | 起点 |
| `destination` | GeoPoint? | 终点（可选） |
| `time_window` | TimeWindow? | 时间窗（可选） |
| `priority` | number | 优先级（0-100） |
| `constraints` | object? | 附加约束 |
| `service_level` | string? | 服务等级 |

### 8.3 地理坐标（GeoPoint）

| 字段 | 类型 | 说明 |
|---|---|---|
| `lat` | number | 纬度 |
| `lng` | number | 经度 |

### 8.4 时间窗（TimeWindow）

| 字段 | 类型 | 说明 |
|---|---|---|
| `start` | number | 起始时间戳（毫秒） |
| `end` | number | 结束时间戳（毫秒） |

---

## 九、数据库表结构

### 9.1 `vehicle_latest`

车辆最新状态（热数据）。

| 列 | 类型 | 说明 |
|---|---|---|
| `vehicle_id` | TEXT (PK) | 车辆 ID |
| `status` | TEXT | 状态 |
| `battery` | NUMERIC(5,2) | 电量 |
| `lat` | DOUBLE PRECISION | 纬度 |
| `lng` | DOUBLE PRECISION | 经度 |
| `heading` | NUMERIC(6,2) | 航向 |
| `speed` | NUMERIC(6,2) | 速度 |
| `updated_at` | TIMESTAMPTZ | 更新时间 |

### 9.2 `vehicle_telemetry`

车辆遥测（时序）。

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGSERIAL (PK) | 自增 ID |
| `vehicle_id` | TEXT | 车辆 ID |
| `ts` | TIMESTAMPTZ | 时间戳 |
| `lat` / `lng` | DOUBLE PRECISION | 位置 |
| `speed` | NUMERIC(6,2) | 速度 |
| `battery` | NUMERIC(5,2) | 电量 |
| `heading` | NUMERIC(6,2) | 航向 |
| `payload` | JSONB | 完整 payload |
| `created_at` | TIMESTAMPTZ | 入库时间 |

### 9.3 `alerts`

告警。

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGSERIAL (PK) | 自增 ID |
| `vehicle_id` | TEXT | 车辆 ID |
| `alert_type` | TEXT | 告警类型 |
| `level` | TEXT | 级别 |
| `message` | TEXT | 消息 |
| `payload` | JSONB | 附加数据 |
| `created_at` | TIMESTAMPTZ | 入库时间 |

### 9.4 `dispatch_commands`

调度指令审计。

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGSERIAL (PK) | 自增 ID |
| `command_id` | TEXT UNIQUE | 指令 ID |
| `vehicle_id` | TEXT | 车辆 ID |
| `task_id` | TEXT | 任务 ID |
| `command_type` | TEXT | 指令类型 |
| `payload` | JSONB | 指令数据 |
| `status` | TEXT | pending / acked / failed |
| `issued_at` | TIMESTAMPTZ | 下发时间 |
| `acked_at` | TIMESTAMPTZ | 确认时间 |

---

## 十、Redis 热路径

| key | 类型 | 内容 | TTL |
|---|---|---|---|
| `vehicle:{id}:latest` | string | 最新状态 JSON | 60s |
| `vehicle:{id}` | hash | 最新状态字段 | 无 |
| `vehicles:active` | set | 活跃车辆 ID | 无 |
| `alerts:recent` | list | 最近告警 JSON | 无 |
| `region:{region}:stats` | hash | 区域统计 | 无 |

---

## 十一、V1 修改

无（首版）。

## 十二、后续版本

### 阶段六之后

- 补充 gRPC 接口定义（Protobuf）
- 补充 WebSocket / SSE 推送
- 补充 OpenAPI / Swagger 规范文件
- 补充 API 版本控制策略

### 长期

- 多版本 API 共存
- API 网关级流控
- GraphQL 支持