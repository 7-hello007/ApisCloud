# 报表插件 V1

## 一、功能目标

reporting 是**进程内插件**，通过 `ctx.http` 调 data-writer 的查询端点，生成报表，通过 `getRoutes()` 暴露 HTTP 端点给前端。

**定位：**

- 插件，不是核心服务
- 不直接连 PG/Redis（通过 HTTP 调 data-writer）
- 通过 `getRoutes()` 暴露端点，由 gateway 聚合
- 纯逻辑 + 薄封装

**数据流：**

```
前端 ──HTTP──→ gateway ──plugin route──→ reporting 插件
                                              │
                                              └── ctx.http.get ──→ data-writer /api/query/*
                                                                         │
                                                                         └── Redis / PG
```

**核心规则：**

- 不直接 require `@apiscloud/message-bus`，依赖通过 `ctx` 注入
- 不订阅任何总线主题，靠 HTTP 拉数据
- 不直接连 PG/Redis，保持"只有 data-writer 连库"的架构原则
- 端点由 gateway 聚合，前端只连 gateway

## 二、基础实现

### 2.1 文件位置

```
plugins/reporting/
├── plugin.json
└── src/
    ├── reports.js              — 纯逻辑
    └── index.js                — 插件入口
```

### 2.2 plugin.json

```json
{
  "name": "reporting",
  "version": "1.0.0",
  "core": false,
  "profile": ["core", "full"],
  "lazy": true,
  "dependsOn": [],
  "topics": {
    "subscribe": [],
    "publish": []
  },
  "routes": [
    "/api/reporting/summary",
    "/api/reporting/vehicles",
    "/api/reporting/alerts"
  ],
  "frontend": null,
  "description": "报表导出：从 data-writer 查询端点拉数据，生成报表"
}
```

**关键字段：**

- `topics.subscribe`：空，不订阅任何总线主题
- `routes`：3 个 HTTP 端点，由 plugin-host 的 `getRoutes()` 聚合
- `frontend`：null，阶段五不做前端

### 2.3 数据源：data-writer 查询端点

| 端点 | 数据源 | 用途 |
|---|---|---|
| `GET /api/query/vehicles/active` | Redis `vehicles:active` + PG `vehicle_latest` | 活跃车辆列表 |
| `GET /api/query/vehicles/:id` | PG `vehicle_latest` | 单车详情 |
| `GET /api/query/alerts/recent` | Redis `alerts:recent` | 最近告警 |
| `GET /api/query/commands/recent` | PG `dispatch_commands` | 最近指令 |

**插件通过 `ctx.http.get(url)` 调用：**

```js
const res = await http.get(`${services.dataWriter}/api/query/vehicles/active`);
```

`ctx.services.dataWriter` 由 plugin-host 注入，默认从环境变量计算：

- `DATA_WRITER_URL`（默认 `http://localhost:9104`）
- 或从 `DATA_WRITER_PORT`（默认 9104）拼

### 2.4 暴露端点

| 端点 | 返回 |
|---|---|
| `GET /api/reporting/summary` | 车辆 + 告警 + 命令的完整汇总 |
| `GET /api/reporting/vehicles` | 车辆列表 + 汇总 |
| `GET /api/reporting/alerts` | 告警列表 + 汇总 |

**响应结构（summary）：**

```json
{
  "generated_at": "2026-01-01T00:00:00.000Z",
  "vehicles": {
    "total": 100,
    "byStatus": {
      "running": 60,
      "idle": 30,
      "charging": 10
    },
    "avgBattery": 76.5,
    "lowBatteryCount": 5
  },
  "alerts": {
    "total": 20,
    "byLevel": {
      "warning": 15,
      "critical": 5
    },
    "byType": {
      "speed_anomaly": 12,
      "battery_drop": 8
    }
  },
  "commands": {
    "total": 50,
    "byType": {
      "dispatch": 40,
      "charge": 10
    },
    "byStatus": {
      "pending": 45,
      "acked": 5
    }
  }
}
```

### 2.5 纯逻辑 `reports.js`

无 I/O，所有函数确定输入输出。

**导出 4 个函数：**

| 函数 | 作用 |
|---|---|
| `summarizeVehicles(vehicles)` | 按状态分组、平均电量、低电量数 |
| `summarizeAlerts(alerts)` | 按 level / type 分组 |
| `summarizeCommands(commands)` | 按 type / status 分组 |
| `buildSummary({ vehicles, alerts, commands, generatedAt })` | 组合三个汇总 |

**`summarizeVehicles` 返回：**

```js
{
  total: number,
  byStatus: Record<string, number>,
  avgBattery: number,      // 保留两位小数
  lowBatteryCount: number  // battery < 20
}
```

**`summarizeAlerts` 返回：**

```js
{
  total: number,
  byLevel: Record<string, number>,
  byType: Record<string, number>
}
```

**`summarizeCommands` 返回：**

```js
{
  total: number,
  byType: Record<string, number>,
  byStatus: Record<string, number>
}
```

### 2.6 插件入口 `index.js`

| 钩子 | 行为 |
|---|---|
| `onLoad(ctx)` | 从 `ctx.http`、`ctx.services` 拿 HTTP 客户端和服务 URL |
| `onUnload()` | 清空 `http`、`services` |
| `onMessage()` | 无（不订阅总线） |
| `onTimer()` | 无 |
| `getRoutes()` | 返回 3 个 HTTP 路由 |
| `getHealth()` | 返回 data-writer 地址 |

**`getRoutes()` 返回结构：**

```js
[
  {
    method: 'GET',
    path: '/api/reporting/summary',
    handler: async (_req, res) => { ... }
  },
  ...
]
```

每个 handler：

1. 检查 `http` 和 `services.dataWriter` 是否就绪，否则返回 503。
2. 并行调 data-writer 的查询端点。
3. 组合汇总，返回 JSON。
4. 出错返回 500。

### 2.7 服务注入

**plugin-host 的 `PluginContext` 提供：**

```ts
interface PluginContext {
  pluginId: string;
  logger: Logger;
  bus?: MessageBus;
  createEnvelope?: <T>(options) => Envelope<T>;
  topics?: { TELEMETRY_RAW, ... };
  http?: HttpClient;         // 阶段五新增
  services?: ServiceUrls;    // 阶段五新增
  [key: string]: unknown;
}
```

**`HttpClient`：**

```ts
interface HttpClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
}
```

内部用 `fetch` + `AbortController` 实现超时（默认 10s）。

**`ServiceUrls`：**

```ts
interface ServiceUrls {
  dataWriter?: string;   // 默认 http://localhost:9104
  gateway?: string;      // 默认 http://localhost:9101
}
```

### 2.8 访问路径

```
前端
  │ GET /api/reporting/summary
  ▼
gateway（9101）
  │ 匹配 plugin route
  ▼
reporting 插件 handler
  │ ctx.http.get
  ▼
data-writer（9104）
  │ /api/query/vehicles/active、/api/query/alerts/recent、/api/query/commands/recent
  ▼
Redis / PG
```

### 2.9 架构原则的保持

**"只有 data-writer 连库"** 的原则没被破坏：

- reporting 不直接连 PG/Redis。
- 通过 HTTP 调 data-writer 的查询端点。
- data-writer 是唯一连库的服务。

**"插件通过 ctx 拿依赖"** 的原则：

- 不 `require('@apiscloud/message-bus')`。
- 从 `ctx.http`、`ctx.services` 拿工具。
- 插件真正独立可分发。

### 2.10 幂等与缓存（当前不做）

- 每次请求都实时查 data-writer。
- 不缓存结果。
- 未来可加短期缓存（如 5s）减少重复查询。

## 三、V1 修改

无（首版）。

## 四、后续版本

### 阶段六计划

- **导出 CSV / Excel**：`GET /api/reporting/export?format=csv`
- **定时报表**：每天/每周生成报表，发 events.alerts 或写文件
- **图表数据**：为前端 ECharts / Recharts 提供时间序列数据
- **报表模板**：可配置的报表格式
- **时间范围查询**：`GET /api/reporting/summary?from=...&to=...`

### 长期演进

- **大数据量支持**：分页、流式响应
- **多维度聚合**：按区域、车队、车型
- **异步报表**：请求后排队生成，回调或轮询取结果
- **报表订阅**：用户订阅定期报表

### 依赖 data-writer 的扩展

reporting 的能力受 data-writer 查询端点限制。未来 data-writer 扩展查询端点，reporting 可相应扩展：

| data-writer 新端点 | reporting 可用能力 |
|---|---|
| `/api/query/vehicles/by-region` | 按区域报表 |
| `/api/query/telemetry/timeseries` | 时间序列报表 |
| `/api/query/commands/by-vehicle` | 按车辆统计指令 |
| `/api/query/alerts/by-type` | 按类型统计告警 |

### 缓存与性能

- 短期缓存（如 5s TTL）：减少高频重复查询。
- 异步刷新：后台定时刷新，请求直接读缓存。
- 分页：大数据量时只返回当前页。