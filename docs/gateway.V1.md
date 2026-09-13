# Gateway V1

## 一、功能目标

gateway 是系统的 **HTTP 统一入口**，聚合插件路由、反向代理后端服务、暴露管理端点，供前端和外部调用。

**定位：**

- 核心服务，冻结维护
- HTTP 入口，前端只连它
- 内部创建 PluginHost，与插件同进程
- 聚合插件路由（`PluginHost.getRoutes()`）
- 反向代理到 ingest / data-writer / dispatch-core
- 暴露 `/health`、`/metrics`、`/api/registry`
- 订阅插件关心的主题，转发消息给插件
- 独立启动，不走 plugin-host（自己就是宿主）

**数据流：**

```
前端 / 外部 ──HTTP──→ gateway ──┬──→ 管理端点（/health、/api/registry）
                                ├──→ 插件路由（/api/dashboard/*）
                                ├──→ 反向代理（/api/proxy/{service}/*）
                                └──→ 消息桥（订阅 telemetry.raw → 插件）
```

## 二、基础实现

### 2.1 文件位置

```
core/services/gateway/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts
    ├── config.ts
    ├── plugin-loader.ts
    ├── router.ts
    ├── proxy.ts
    ├── server.ts
    └── service.ts
```

### 2.2 依赖

- `@apiscloud/libs`：配置、日志、健康
- `@apiscloud/message-bus`：总线、信封、主题
- `@apiscloud/observability`：logger / metrics
- `@apiscloud/plugin-host`：插件宿主

### 2.3 配置项

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| GATEWAY_PORT | 9101 | HTTP 端口 |
| GATEWAY_PROFILE | core | 加载插件的 profile |
| GATEWAY_PROXY_PREFIX | /api/proxy | 反向代理前缀 |
| GATEWAY_PLUGIN_DIRS | `<cwd>/plugins,<cwd>/plugins/dispatch` | 插件扫描目录（逗号分隔） |
| INGEST_PORT | 9103 | ingest 代理目标端口 |
| DATA_WRITER_PORT | 9104 | data-writer 代理目标端口 |
| DISPATCH_CORE_PORT | 9105 | dispatch-core 代理目标端口 |

### 2.4 三种路由

| 类型 | 路径模式 | 处理 |
|---|---|---|
| 管理端点 | `/health`、`/metrics`、`/api/registry` | 内联 handler |
| 反向代理 | `/api/proxy/{service}/{rest}` | 转发到 `http://localhost:{port}/{rest}` |
| 插件路由 | 由 `PluginHost.getRoutes()` 聚合 | 直接调 handler |

**优先级：** 管理端点 > 反向代理 > 插件路由 > 404。

### 2.5 管理端点

**`GET /health`：**

```json
{
  "status": "ok",
  "service": "gateway",
  "timestamp": "2026-09-13T...",
  "checks": {
    "self": { "status": "ok", "message": "gateway running" },
    "bus": { "status": "ok" },
    "plugin-host": { "status": "ok", "message": "geofence,anomaly,dashboard" },
    "proxiedServices": { "status": "ok", "message": "ingest,data-writer,dispatch-core" }
  }
}
```

**`GET /metrics`：** Prometheus 格式，来自 observability 服务。

**`GET /api/registry`：**

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
      "frontend": "dashboard"
    }
  ],
  "byProfile": {
    "core": ["anomaly", "dashboard", "geofence", "nearest"],
    "full": ["anomaly", "batch-match", "dashboard", "geofence", "nearest", "priority-dispatch"]
  }
}
```

前端通过这个端点发现插件、加载前端模块。

### 2.6 反向代理

`/api/proxy/{service}/{rest}` → `http://localhost:{servicePort}/{rest}`。

透传 method、headers、body，回传 status、headers、body。

目标服务找不到返回 404，目标服务连不上返回 502。

### 2.7 插件路由

PluginHost 加载插件后，`host.getRoutes()` 聚合所有插件的 `getRoutes()` 返回的路由。

gateway 把这些路由注册到自己的 HTTP 服务器，请求 `{method} {path}` 精确匹配。

### 2.8 消息桥

gateway 扫描所有已加载插件的 `manifest.topics.subscribe`，聚合主题，统一用消费组 `apiscloud-gateway` 订阅。

消息到达时调 `host.dispatchMessage(topic, env)`，分发给订阅了该主题的插件。

### 2.9 服务组合

`createGatewayService` 组合：

- 配置：`loadGatewayConfig`
- 总线：`createMessageBus`
- 可观测性：`createObservabilityService`
- PluginHost：注入 bus、createEnvelope、topics
- 从 `pluginDirs` 加载插件
- HTTP 服务器：`createGatewayServer`
- 消息桥：订阅插件主题

**启动流程：**

1. 连接总线
2. 加载插件（按 profile 过滤）
3. 聚合插件路由
4. 订阅插件主题
5. 启动 HTTP 服务器

**停止流程：**

1. 取消所有总线订阅
2. 卸载插件
3. 停止 HTTP 服务器
4. 关闭总线

### 2.10 关键设计

**不启动 observability 的 HTTP 服务器**

只复用 `logger`、`metrics`、`addHealthTarget`。HTTP 服务器由 gateway 自己的 server 承担，避免端口冲突。

**插件通过 `ctx` 拿依赖**

插件不 `require('@apiscloud/message-bus')`，而是从 `ctx.bus`、`ctx.createEnvelope`、`ctx.topics` 拿。插件真正独立可分发。

**`port: 0` 支持动态端口**

测试场景用 `port: 0`，`gateway.port()` 返回系统分配的端口。

**CORS 头**

所有响应带 `Access-Control-Allow-Origin: *`，前端开发方便。

### 2.11 独立启动

```bash
node dist/server-entry.js
```

环境变量：

- `GATEWAY_PORT` 覆盖端口，默认 9101

支持 SIGTERM、SIGINT 优雅关闭。

### 2.12 监控集成

`monitor/prometheus/prometheus.yml` 已含 gateway target：`host.docker.internal:9101`。

## 三、V1 修改

无（首版）。

## 四、后续版本

- 阶段五：鉴权（JWT + 白名单）
- 阶段五：限流（IP + 路径）
- 阶段五：静态文件服务（`web/dist`）
- 阶段五：WebSocket / SSE 推送
- 阶段六：gRPC 支持
- 阶段六：多集群路由