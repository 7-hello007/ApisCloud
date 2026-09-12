# 统一写库 V1

## 一、功能目标

data-writer 是系统**唯一的写库者**，负责消费消息总线上的事件，写入 PostgreSQL 和 Redis。

**定位**：

- 唯一连库的服务（PG + Redis）
- 只订阅总线，不连 MQTT
- 不做业务逻辑，只做持久化
- 独立启动，不走 plugin-host
- 暴露 /metrics 和 /health
- 数据流方向：消息总线 → data-writer → PG + Redis

**订阅三个主题**：

| 主题 | 处理方式 |
|---|---|
| telemetry.raw | UPSERT vehicle_latest + INSERT vehicle_telemetry + 写 Redis 热路径 |
| telemetry.aggregated | 写 Redis 区域聚合统计 |
| events.alerts | INSERT alerts + 写 Redis 最近告警列表 |

**关键规则**：

- 只有 data-writer 连库，其他服务不碰 PG/Redis
- 服务之间零直接调用，只通过消息总线
- 每条消息独立 try/catch，一条失败不影响下一条
- 三个阶段主题的消费组统一为 apiscloud-data-writer

## 二、基础实现

### 2.1 文件位置

```
core/services/data-writer/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts
    ├── config.ts
    ├── mapper.ts
    ├── pg-writer.ts
    ├── redis-writer.ts
    ├── handlers/
    │   ├── telemetry-raw.ts
    │   ├── telemetry-aggregated.ts
    │   └── events-alerts.ts
    └── service.ts
```

### 2.2 依赖

- @apiscloud/libs：配置、日志、健康、PG 封装、Redis 封装、指标
- @apiscloud/message-bus：统一总线接口、信封、主题常量
- @apiscloud/observability：可观测性服务，暴露 /metrics 和 /health

不直接引 pg、ioredis，统一走 libs 封装。

### 2.3 数据模型

**TelemetryRawPayload**：

| 字段 | 说明 |
|---|---|
| vehicle_id | 车辆唯一标识 |
| ts | 毫秒时间戳 |
| lat / lng | 经纬度 |
| speed | 速度 km/h |
| battery | 电量 0-100 |
| heading | 航向 0-360 |
| status | idle / running / charging / maintenance / offline |

**TelemetryAggregatedPayload**：

| 字段 | 说明 |
|---|---|
| region | 区域标识 |
| window_start / window_end | 时间窗起止 |
| vehicle_count | 车辆数 |
| avg_speed | 平均速度 |
| avg_battery | 平均电量 |

**AlertPayload**：

| 字段 | 说明 |
|---|---|
| vehicle_id | 车辆标识 |
| alert_type | 告警类型 |
| level | info / warning / error / critical |
| message | 告警消息 |
| payload | 可选附加数据 |

### 2.4 配置项

从环境变量读取，全部有默认值：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| DATA_WRITER_LATEST_TTL_SEC | 60 | Redis 车辆最新状态 TTL（秒） |
| DATA_WRITER_RECENT_ALERTS_MAX | 100 | Redis 最近告警保留条数 |
| DATA_WRITER_CONSUMER_GROUP | apiscloud-data-writer | 总线消费组 |
| DATA_WRITER_PORT | 9104 | HTTP 端口 |

### 2.5 处理流程

**telemetry.raw**：

```
Envelope
  ↓
1. 提取 payload
2. UPSERT vehicle_latest（车辆最新状态）
3. INSERT vehicle_telemetry（时序数据）
4. 写 Redis:
   - SET vehicle:{id}:latest JSON EX 60
   - HSET vehicle:{id} 各字段
   - SADD vehicles:active {id}
5. metrics.dataFlowMessages.inc({ topic: telemetry.raw, direction: in })
```

**telemetry.aggregated**：

```
Envelope
  ↓
1. 提取 payload
2. 写 Redis:
   - HSET region:{region}:stats 各字段
3. metrics.dataFlowMessages.inc({ topic: telemetry.aggregated, direction: in })
```

**events.alerts**：

```
Envelope
  ↓
1. 提取 payload
2. INSERT alerts（告警记录）
3. 写 Redis:
   - LPUSH alerts:recent JSON
   - LTRIM alerts:recent 0 (max-1)
4. metrics.dataFlowMessages.inc({ topic: events.alerts, direction: in })
```

### 2.6 PG 写入

**vehicle_latest UPSERT**：

```sql
INSERT INTO vehicle_latest
  (vehicle_id, status, battery, lat, lng, heading, speed, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, now())
ON CONFLICT (vehicle_id) DO UPDATE SET
  status = EXCLUDED.status,
  battery = EXCLUDED.battery,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  heading = EXCLUDED.heading,
  speed = EXCLUDED.speed,
  updated_at = now()
```

**vehicle_telemetry INSERT**：

```sql
INSERT INTO vehicle_telemetry
  (vehicle_id, ts, lat, lng, speed, battery, heading, payload)
VALUES ($1, $2::timestamptz, $3, $4, $5, $6, $7, $8::jsonb)
```

ts 从毫秒时间戳转为 ISO 字符串。

**alerts INSERT**：

```sql
INSERT INTO alerts
  (vehicle_id, alert_type, level, message, payload)
VALUES ($1, $2, $3, $4, $5::jsonb)
```

### 2.7 Redis 热路径设计

| key | 类型 | 内容 | TTL |
|---|---|---|---|
| vehicle:{id}:latest | string | 最新状态 JSON | 60s |
| vehicle:{id} | hash | 最新状态字段 | 无 |
| vehicles:active | set | 活跃车辆 ID | 无 |
| alerts:recent | list | 最近告警 JSON | 无 |
| region:{region}:stats | hash | 区域统计 | 无 |

### 2.8 映射逻辑

**telemetryToPgParams**：

- 输入：TelemetryRawPayload
- 输出：8 个参数
- ts 毫秒转 ISO 字符串
- payload 转 JSON 字符串

**telemetryToLatestParams**：

- 输入：TelemetryRawPayload
- 输出：7 个参数
- 顺序：vehicle_id, status, battery, lat, lng, heading, speed

**alertToPgParams**：

- 输入：AlertPayload
- 输出：5 个参数
- 无 payload 时第 5 个参数为 null

### 2.9 PG 写入器

createPgWriter(pg) 返回：

| 方法 | 作用 |
|---|---|
| upsertVehicleLatest | UPSERT vehicle_latest |
| insertTelemetry | INSERT vehicle_telemetry |
| insertAlert | INSERT alerts |

只负责 SQL 执行，不含业务逻辑。

### 2.10 Redis 写入器

createRedisWriter(redis) 返回：

| 方法 | 作用 |
|---|---|
| writeVehicleLatest | 写车辆最新状态（string + hash + set） |
| writeRecentAlert | 推入最近告警列表并裁剪 |
| writeRegionStats | 写区域聚合统计 hash |

### 2.11 服务组合

createDataWriterService 组合：

- 配置：loadDataWriterConfig
- 总线：createMessageBus
- PG：createPg
- Redis：createRedis
- PG 写入器：createPgWriter
- Redis 写入器：createRedisWriter
- 三个 handler
- 可观测性：createObservabilityService

**可注入依赖**：pg、redis、bus 都可通过 options 覆盖，便于单元测试。

启动流程：

1. 连接总线
2. 启动 HTTP 服务器
3. 订阅 telemetry.raw，回调 onTelemetryRaw
4. 订阅 telemetry.aggregated，回调 onTelemetryAggregated
5. 订阅 events.alerts，回调 onEventsAlerts
6. 注册健康检查：bus、pg、redis

停止流程：

1. 取消所有总线订阅
2. 关闭总线
3. 关闭 PG
4. 关闭 Redis
5. 停止 HTTP 服务器

### 2.12 异常处理

- **每条消息独立 try/catch**：一条失败不影响下一条
- **PG 写入失败**：记录 error，不阻塞消息消费
- **Redis 写入失败**：记录 error，不阻塞消息消费
- **stop 幂等**：重复调用不会报错

### 2.13 健康检查

/health 返回四个检查项：

| 检查项 | 说明 |
|---|---|
| self | 可观测性服务自身 |
| bus | 总线健康状态，含订阅数 |
| pg | PostgreSQL 连接状态 |
| redis | Redis 连接状态 |

### 2.14 指标

复用可观测性服务的指标集：

- apiscloud_dataflow_messages_total{topic="telemetry.raw",direction="in"}：遥测消息数
- apiscloud_dataflow_messages_total{topic="telemetry.aggregated",direction="in"}：聚合消息数
- apiscloud_dataflow_messages_total{topic="events.alerts",direction="in"}：告警消息数
- apiscloud_http_requests_total：HTTP 请求数
- apiscloud_http_request_duration_seconds：HTTP 延迟
- Prometheus 默认指标

### 2.15 独立启动

命令：

```bash
node dist/server-entry.js
```

环境变量：

- DATA_WRITER_PORT 覆盖端口，默认 9104

支持 SIGTERM、SIGINT 优雅关闭。

### 2.16 监控集成

monitor/prometheus/prometheus.yml 已含 data-writer target：host.docker.internal:9104。

Grafana 可通过 Prometheus 数据源看到 data-writer 指标。

## 三、V1 修改

无（首版）。

## 四、后续版本

- 阶段三：telemetry.aggregated 写入 PG 聚合表
- 阶段三：dispatch_commands 表写入
- 阶段五：批量写入优化（攒批 + 事务）
- 阶段五：分库分表、时序数据库
- 阶段六：数据库迁移脚本
- 阶段六：Redis 集群、读写分离