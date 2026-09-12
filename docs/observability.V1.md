# 可观测性服务 V1

## 一、功能目标

覆盖插件、服务、数据流三层，暴露 `/metrics` 给 Prometheus 抓，暴露 `/health` 给编排系统探，日志统一格式给 Loki 采，追踪字段预留给 OpenTelemetry。

## 二、基础实现

### 2.1 文件位置

```
core/services/observability/
├── src/
│   ├── types.ts        — ObservabilityOptions、TracingContext 等
│   ├── metrics.ts      — 9 个指标
│   ├── health.ts       — 健康检查注册中心
│   ├── logger.ts       — pino logger + trace 上下文
│   ├── tracing.ts      — Tracer 类
│   ├── server.ts       — HTTP 服务器
│   ├── service.ts      — ObservabilityService 组合
│   ├── index.ts        — 统一出口
│   └── server-entry.ts — 独立进程入口
└── package.json
```

### 2.2 三层指标 + 总线指标

| 层 | 指标 |
|---|---|
| 服务层 | `apiscloud_http_requests_total`、`apiscloud_http_request_duration_seconds` |
| 数据流层 | `apiscloud_dataflow_messages_total`、`apiscloud_dataflow_latency_seconds` |
| 插件层 | `apiscloud_plugin_actions_total`、`apiscloud_plugin_action_duration_seconds` |
| 总线层 | `apiscloud_bus_published_total`、`apiscloud_bus_consumed_total`、`apiscloud_bus_consumer_lag` |

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

## 四、后续版本

- 阶段六：接入 OpenTelemetry + Jaeger
- 阶段六：Promtail 采集日志到 Loki
- 阶段六：Grafana 面板补充三层指标视图