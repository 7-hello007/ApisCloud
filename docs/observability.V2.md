# 可观测性服务 V2

## 一、功能目标

覆盖插件、服务、数据流三层，暴露 `/metrics` 给 Prometheus 抓，暴露 `/health` 给编排系统探，日志统一格式给 Loki 采，追踪字段预留给 OpenTelemetry。

**V2 相比 V1，新增业务层指标、Grafana 仪表板、Loki 结构化标签。**

## 二、基础实现

### 2.1 文件位置

```
core/services/observability/
├── src/
│   ├── types.ts        — ObservabilityOptions、TracingContext 等
│   ├── metrics.ts      — 14 个指标（V2 扩展后）
│   ├── health.ts       — 健康检查注册中心
│   ├── logger.ts       — pino logger + trace 上下文
│   ├── tracing.ts      — Tracer 类
│   ├── server.ts       — HTTP 服务器
│   ├── service.ts      — ObservabilityService 组合
│   ├── index.ts        — 统一出口
│   └── server-entry.ts — 独立进程入口
└── package.json
```

### 2.2 四层指标 + 业务指标

V1 有 9 个指标（服务层 2、数据流层 2、插件层 2、总线层 3）。V2 在业务层新增 5 个，共 **14 个**。

| 层 | 指标 |
|---|---|
| 服务层 | `apiscloud_http_requests_total`、`apiscloud_http_request_duration_seconds` |
| 数据流层 | `apiscloud_dataflow_messages_total`、`apiscloud_dataflow_latency_seconds` |
| 插件层 | `apiscloud_plugin_actions_total`、`apiscloud_plugin_action_duration_seconds` |
| 总线层 | `apiscloud_bus_published_total`、`apiscloud_bus_consumed_total`、`apiscloud_bus_consumer_lag` |
| **业务层（V2 新增）** | `apiscloud_dispatch_tasks_total`、`apiscloud_plugin_dispatch_total`、`apiscloud_charging_commands_total`、`apiscloud_geofence_events_total`、`apiscloud_anomaly_events_total` |

### 2.3 两个端点

| 端点 | 作用 |
|---|---|
| `/metrics` | Prometheus 格式，含默认指标 + 自定义指标 |
| `/health` | JSON 健康检查，down 时返回 503 |

### 2.4 日志格式

统一 pino JSON，字段含：

| 字段 | 说明 |
|---|---|
| `service` | 服务名 |
| `layer` | 层名 |
| `plugin` | 插件名（若有） |
| `trace_id` | 追踪 ID |
| `span_id` | 跨度 ID |
| `timestamp` | ISO 时间 |
| `level` | 日志级别 |
| `msg` | 日志内容 |

### 2.5 追踪预留

日志格式已含 `trace_id`、`span_id`，未来接 OpenTelemetry + Jaeger 零改动。`newTraceContext()` 是当前占位实现，未来替换为 OTel 的 context。

### 2.6 独立启动

```bash
cd core/services/observability
OBSERVABILITY_PORT=9106 node dist/server-entry.js
```

支持 SIGTERM/SIGINT 优雅关闭。

### 2.7 内嵌使用

```ts
const svc = createObservabilityService({
  service: 'ingest',
  port: 9103,
  logLevel: config.LOG_LEVEL,
});

svc.addHealthTarget({
  name: 'mqtt',
  check: async () => ({ status: 'ok' }),
});

await svc.start();

// 业务：用 svc.logger、svc.metrics、svc.tracer

await svc.stop();
```

## 三、V1 修改

无（首版）。

## 四、V2 修改

### 变更一：新增 5 个业务层指标

**为什么改：**

阶段六要"完善可观测性，覆盖插件、服务、数据流"。V1 只有服务/数据流/插件/总线四层指标，**业务动作层面缺失**。用户看 Prometheus 时，看不到"任务数、指令数、告警数"，只能看到 HTTP QPS 和消息吞吐。

**怎么改：**

在 `createObservabilityMetrics` 里加 5 个 counter：

| 指标 | 标签 | 用途 |
|---|---|---|
| `apiscloud_dispatch_tasks_total` | `task_type`、`algorithm`、`result` | 调度任务接收总数 |
| `apiscloud_plugin_dispatch_total` | `plugin`、`topic` | 插件消息分发次数 |
| `apiscloud_charging_commands_total` | `command_type`、`result` | 充电调度指令数 |
| `apiscloud_geofence_events_total` | `event_type`、`level` | 地理围栏事件数 |
| `apiscloud_anomaly_events_total` | `alert_type`、`level` | 异常检测事件数 |

**使用方式：**

**dispatch-core 的 `handleTask`：**

```ts
// 无候选车辆时
observability.metrics.dispatchTasks.inc({
  task_type: task.task_type,
  algorithm: 'none',
  result: 'no_candidates',
});

// 无可用算法时
observability.metrics.dispatchTasks.inc({
  task_type: task.task_type,
  algorithm: 'none',
  result: 'no_algorithm',
});

// 算法无输出时
observability.metrics.dispatchTasks.inc({
  task_type: task.task_type,
  algorithm: algorithm.name,
  result: 'empty_output',
});

// 算法返回的车辆不在候选集
observability.metrics.dispatchTasks.inc({
  task_type: task.task_type,
  algorithm: algorithm.name,
  result: 'invalid_output',
});

// 调度成功
observability.metrics.dispatchTasks.inc({
  task_type: task.task_type,
  algorithm: algorithm.name,
  result: 'dispatched',
});
```

**gateway 的消息桥：**

```ts
await bus.subscribe(
  topic,
  async (env: Envelope) => {
    await pluginHost.dispatchMessage(topic, env);
    observability.metrics.pluginDispatch.inc({
      plugin: 'gateway-bridge',
      topic,
    });
  },
  { groupId: 'apiscloud-gateway' },
);
```

**`result` 标签的取值：**

| result | 含义 |
|---|---|
| `dispatched` | 成功派单 |
| `no_candidates` | 硬约束过滤后无候选 |
| `no_algorithm` | 算法注册表为空 |
| `empty_output` | 算法返回空列表 |
| `invalid_output` | 算法返回的车辆不在候选集 |

**在 Grafana 上能直接算成功率：**

```
sum(rate(apiscloud_dispatch_tasks_total{result="dispatched"}[5m]))
  / sum(rate(apiscloud_dispatch_tasks_total[5m]))
```

**影响：**

- `ObservabilityMetrics` 接口加 5 个字段。
- 所有调用方都是**读字段**，不赋值。
- `createObservabilityMetrics` 返回完整对象。
- TypeScript 编译通过，**旧代码不受运行时影响**。

### 变更二：Grafana 仪表板

**为什么改：**

V1 只有 Prometheus 抓指标，**没有可视化**。用户必须手写 PromQL 才能看数据，体验差。

**怎么改：**

创建 `monitor/grafana/dashboards/apiscloud-overview.json`，包含 6 类 panel：

| Panel | 类型 | 内容 |
|---|---|---|
| 服务 QPS | timeseries | `sum by (service) (rate(apiscloud_http_requests_total[1m]))` |
| HTTP 延迟 P95 | timeseries | `histogram_quantile(0.95, sum by (service, le) (rate(apiscloud_http_request_duration_seconds_bucket[5m])))` |
| 数据流吞吐 | timeseries | `sum by (topic) (rate(apiscloud_dataflow_messages_total[1m]))` |
| 插件消息分发 | timeseries | `sum by (plugin) (rate(apiscloud_plugin_dispatch_total[1m]))` |
| 调度任务（按结果） | timeseries | `sum by (result) (rate(apiscloud_dispatch_tasks_total[1m]))` |
| 业务指标累计 | stat | 充电指令 + 围栏事件 + 异常事件累计数 |

**自动加载：**

Grafana 通过 `monitor/grafana/provisioning/dashboards/dashboards.yml` 挂载整个目录，**JSON 文件放进 `monitor/grafana/dashboards/` 就自动生效**，不需要手动 Import。

**刷新策略：**

`"refresh": "10s"`，每 10 秒自动刷新一次。

**访问方式：**

`http://localhost:13000` → Dashboards → ApisCloud 总览。

### 变更三：Loki 结构化标签

**为什么改：**

V1 日志只用 Loki 默认的 `filename` 标签，用户无法按 `service`、`plugin`、`trace_id` 过滤。**排查问题时只能全文搜索，效率低。**

**怎么改：**

改 `monitor/loki/loki-config.yml`：

**启用结构化元数据：**

```yaml
limits_config:
  allow_structured_metadata: true
  retention_period: 168h
```

**声明字段白名单：**

```yaml
structured_metadata:
  fields:
    - service
    - layer
    - plugin
    - trace_id
    - span_id
    - level
```

**加 compactor 保留 7 天：**

```yaml
compactor:
  working_directory: /loki/compactor
  compaction_interval: 10m
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150
  delete_request_store: filesystem
```

**schema 升级到 v13：**

```yaml
schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h
```

**Grafana 查询示例：**

```
# 1. 按字段过滤（推荐）
{service="gateway"} | json | plugin="geofence"

# 2. 按 trace 追踪
{trace_id="trace-xxx"}

# 3. 按错误级别过滤多服务
{service=~"gateway|data-writer"} | json | level="error"

# 4. 组合条件
{service="dispatch-core"} | json | result="no_candidates"
```

## 五、后续版本

- 阶段六：接入 OpenTelemetry + Jaeger（当前预留字段）
- 阶段六：Promtail 采集日志到 Loki
- 阶段六：Grafana 面板补充业务指标告警规则
- 阶段六：插件端指标上报（通过 `ctx.metrics` 注入，让插件不直接 import observability）
- 阶段六：告警规则（Grafana Alerting 或 Prometheus Alertmanager）
- 阶段六：Grafana 仪表板增加"数据流拓扑图"
- 阶段六：按 `trace_id` 跨服务串联日志

## 附：V2 关键设计权衡

### 权衡一：插件端指标怎么上报

**问题：** 插件是 JS，运行在 plugin-host 里。让插件直接 `import '@apiscloud/observability'` 会破坏"插件独立可分发"的设计。

**三个选择：**

| 方案 | 评价 |
|---|---|
| A. 插件直接 import observability | ❌ 破坏插件独立 |
| B. `ctx.metrics` 注入 | ✅ 推荐，宿主统一管理 |
| C. 业务事件通过总线回传 | ❌ 绕远，延迟高 |

**本批选择：** 只做服务端（dispatch-core、gateway）的指标补齐。**插件端（charging-scheduler、geofence、anomaly）留到后续版本**，通过 `ctx.metrics` 注入。

**未来实现方式：**

```ts
// plugin-host 的 buildContext 里注入
ctx.metrics = {
  inc: (name, labels) => observability.metrics.registry.counter(name, ...).inc(labels),
};
```

插件用 `ctx.metrics.inc('apiscloud_charging_commands_total', { ... })`。

### 权衡二：业务指标用 counter 还是 histogram

**问题：** `dispatchTasks` 可以记录"次数"（counter），也可以记录"耗时"（histogram）。

**本批选择：** **只做 counter**。理由：

- 耗时已经由 `dataFlowLatency`（数据流层）和 `pluginDuration`（插件层）覆盖。
- 业务层关心的是"成功/失败比例"，counter + 标签足够。
- histogram 标签基数高，成本大。

### 权衡三：Grafana 仪表板用 JSON 还是代码生成

**问题：** Grafana 仪表板可以手写 JSON，也可以用 `grafanalib` 之类的 DSL 生成。

**本批选择：** **手写 JSON**。理由：

- 一次性创建，很少改动。
- JSON 直接放进 provisioning 目录即可，无需额外构建步骤。
- 字段可读，未来改也简单。

### 权衡四：Loki 结构化标签 vs 全文索引

**问题：** Loki 可以在日志 JSON 里"抽字段成标签"，也可以只用全文索引。

**本批选择：** **结构化标签**。理由：

- 按 `service`、`plugin`、`trace_id` 过滤是最高频查询。
- 结构化标签让过滤先于解析，性能高。
- 白名单限制基数是关键（`trace_id` 虽然基数高，但只在按 trace 查时才用）。