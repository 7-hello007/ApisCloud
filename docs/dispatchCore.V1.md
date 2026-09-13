# 调度核心 V1

## 一、功能目标

dispatch-core 是智能驾驶服务调度的**核心服务**，负责把任务调度到最合适的车辆，并生成签名后的调度指令下发。

**定位：**

- 核心服务，冻结维护
- 唯一负责"任务 → 车辆"调度的服务
- 不连 MQTT（外部出入口是 ingest）
- 不连 PG/Redis（写库是 data-writer）
- 只订阅总线 `telemetry.raw`，发布总线 `events.commands`
- 独立启动，不走 plugin-host
- 暴露 `/metrics` 和 `/health`
- 调度算法以插件形式提供

**数据流：**

```
telemetry.raw ──→ dispatch-core ──→ events.commands ──→ ingest ──→ MQTT commands/{vehicle_id}
                                                   └──→ data-writer ──→ PG dispatch_commands
```

**核心规则：**

- 服务之间零直接调用，只通过消息总线
- 调度算法以插件形式提供，dispatch-core 自己加载
- 算法失败/超时回退到 nearest
- 命令必须签名
- 命令结构符合 ingest 的 DownlinkCommand 契约

## 二、基础实现

### 2.1 文件位置

```
core/services/dispatch-core/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts
    ├── config.ts
    ├── validation.ts
    ├── geo.ts
    ├── constraints.ts
    ├── objective.ts
    ├── algorithm-interface.ts
    ├── algorithm-registry.ts
    ├── algorithm-loader.ts
    ├── command-builder.ts
    ├── mapper.ts
    └── service.ts
```

### 2.2 依赖

- `@apiscloud/libs`：配置、日志、健康、指标、指令签名、常用 schema
- `@apiscloud/message-bus`：统一总线接口、信封、主题常量
- `@apiscloud/observability`：可观测性服务，暴露 `/metrics` 和 `/health`
- `zod`：任务、车辆校验

### 2.3 数据模型

**DispatchTask：**

| 字段 | 说明 |
|---|---|
| task_id | 任务唯一标识 |
| task_type | passenger / inspection / logistics / charging / maintenance / rescue |
| origin | 起点 |
| destination | 终点（可选） |
| time_window | 时间窗（可选） |
| priority | 优先级 0-100 |
| constraints | 任务附加约束 |
| service_level | 服务等级 |

**DispatchVehicle：**

| 字段 | 说明 |
|---|---|
| vehicle_id | 车辆唯一标识 |
| position | 当前位置 |
| status | idle / running / charging / maintenance / offline |
| battery | 电量 0-100 |
| capabilities | 能提供的服务类型 |
| constraints | 车辆附加约束 |

### 2.4 配置项

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| DISPATCH_CORE_PORT | 9105 | HTTP 端口 |
| DISPATCH_ALGORITHM | nearest | 默认算法 |
| DISPATCH_FALLBACK_ALGORITHM | nearest | 回退算法 |
| DISPATCH_ALGORITHM_TIMEOUT_MS | 500 | 算法超时 |
| DISPATCH_CONSUMER_GROUP | apiscloud-dispatch-core | 总线消费组 |
| DISPATCH_WEIGHT_DISTANCE | 1.0 | 目标函数距离权重 |
| DISPATCH_WEIGHT_ETA | 0.5 | 目标函数 ETA 权重 |
| DISPATCH_WEIGHT_BATTERY | 0.3 | 目标函数电量权重 |
| DISPATCH_WEIGHT_PRIORITY | 2.0 | 目标函数优先级权重 |
| DISPATCH_SIGN_SECRET | change-me-... | 指令签名密钥 |
| DISPATCH_SIGN_TTL_SEC | 60 | 签名有效期 |
| DISPATCH_REGION_CENTER_LAT | 31.2304 | 运营中心纬度 |
| DISPATCH_REGION_CENTER_LNG | 121.4737 | 运营中心经度 |
| DISPATCH_REGION_RADIUS_KM | 30 | 运营半径 |
| DISPATCH_ALGORITHM_DIR | — | 算法插件目录（可选覆盖） |

### 2.5 硬约束过滤

依次检查：

| 约束 | 判断 |
|---|---|
| 状态 | `vehicle.status === 'idle'` |
| 电量 | `vehicle.battery >= 20` |
| 服务能力 | `vehicle.capabilities.includes(task.task_type)`（capabilities 为空不校验） |
| 地理 | 在运营区域内 |
| pickup 距离 | 车辆到任务起点 ≤ 50km |
| 时间窗 | `now + eta <= task.time_window.end` |

不满足任一约束的车辆被拒绝。

### 2.6 目标函数加权

```
score = w_distance * (-distance/50)
      + w_eta * (-eta/refEta)
      + w_battery * (battery/100)
      + w_priority * (priority/100)
```

得分越大越好。权重从环境变量读。

### 2.7 调度流程

```
任务提交
  ↓
硬约束过滤 → 候选车辆
  ↓
算法插件 rank → 排序候选
  ↓
取 ranked[0] → 最优车辆
  ↓
构建 DownlinkCommand
  ↓
HMAC-SHA256 签名
  ↓
发布 events.commands
```

### 2.8 算法插件接口

```ts
interface DispatchAlgorithm {
  name: string;
  version: string;
  rank(input: DispatchAlgorithmInput): Promise<DispatchAlgorithmResult> | DispatchAlgorithmResult;
}

interface DispatchAlgorithmInput {
  task: DispatchTask;
  candidates: DispatchVehicle[];
  context?: Record<string, unknown>;
}

interface DispatchAlgorithmResult {
  ranked: Array<{ vehicle_id: string; score: number; reason?: string }>;
}
```

插件在 `src/index.js` 导出：

```js
module.exports = {
  algorithm: {
    name: 'nearest',
    version: '1.0.0',
    rank(input) { /* ... */ }
  }
};
```

### 2.9 算法加载

从 `plugins/dispatch/*/` 加载。默认路径：

```
path.resolve(__dirname, '..', '..', '..', '..', 'plugins', 'dispatch')
```

支持环境变量 `DISPATCH_ALGORITHM_DIR` 覆盖。

### 2.10 算法回退

- 先试默认算法
- 算法失败/超时 → 回退到 `DISPATCH_FALLBACK_ALGORITHM`
- 回退算法也失败 → 记 warn，不发命令

### 2.11 命令构建

输出结构符合 ingest 的 `DownlinkCommand`：

```ts
{
  vehicle_id: string,
  command_id: string,
  command_type: 'dispatch',
  payload: {
    task_id: string,
    task_type: string,
    origin: GeoPoint,
    destination?: GeoPoint,
    issued_at: number,
    signed: {
      command: SignableCommand,
      signature: string,
      algorithm: string
    }
  }
}
```

签名算法固定 `sha256`，TTL 默认 60s。

### 2.12 服务组合

`createDispatchCoreService` 组合：

- 配置：`loadDispatchCoreConfig`
- 算法注册表：`AlgorithmRegistry`
- 总线：`createMessageBus`
- 可观测性：`createObservabilityService`

**可注入依赖**：`bus`、`algorithmPluginsDir` 可通过 options 覆盖。

**启动流程：**

1. 加载算法插件
2. 连接总线
3. 启动 HTTP 服务器
4. 订阅 `telemetry.raw`，回调累积车辆
5. 注册健康检查：bus、algorithms

**停止流程：**

1. 取消所有总线订阅
2. 关闭总线
3. 停止 HTTP 服务器

### 2.13 异常处理

- **遥测处理失败**：记 warn，跳过该条
- **算法超时**：500ms 后回退
- **算法抛错**：返回 null，回退
- **无候选车辆**：记 warn，不发命令
- **无可用算法**：记 error，不发命令
- **签名失败**：记 error
- **总线发布失败**：记 error

### 2.14 健康检查

`/health` 返回：

| 检查项 | 说明 |
|---|---|
| self | 可观测性服务自身 |
| bus | 总线健康状态 |
| algorithms | 已注册算法列表 |

### 2.15 指标

复用可观测性服务的指标集：

- `apiscloud_dataflow_messages_total{topic="dispatch.tasks",direction="in"}`：接收任务数
- `apiscloud_dataflow_messages_total{topic="events.commands",direction="out"}`：发出命令数
- `apiscloud_http_requests_total`：HTTP 请求数
- `apiscloud_http_request_duration_seconds`：HTTP 延迟
- Prometheus 默认指标

### 2.16 独立启动

```bash
node dist/server-entry.js
```

环境变量：

- `DISPATCH_CORE_PORT` 覆盖端口，默认 9105

支持 SIGTERM、SIGINT 优雅关闭。

### 2.17 监控集成

`monitor/prometheus/prometheus.yml` 已含 dispatch-core target：`host.docker.internal:9105`。

Grafana 可通过 Prometheus 数据源看到 dispatch-core 指标。

### 2.18 任务来源

阶段三暂时通过 `service.submitTask(task)` 注入任务（测试和演示用）。

未来若有 `events.tasks` 主题，只需在 `service.start` 里加一条订阅。

## 三、V1 修改

无（首版）。

## 四、后续版本

- 阶段五：批量任务调度（一批任务 + 一批车辆）
- 阶段五：多算法协作（串行过滤 + 排序，或并行投票）
- 阶段五：算法运行时切换
- 阶段五：任务队列和优先级抢占
- 阶段六：跨层调度（接入层 / 处理层 / 决策层）
- 阶段六：多集群调度
## 附：实机验证记录

**验证时间：** 阶段三完成时

**验证环境：**

- 基础设施：Docker Compose 7 个服务 healthy
- 消息总线：Kafka（KRaft 单节点）
- MQTT：EMQX 5.8
- 数据库：PostgreSQL 16 + Redis 7

**验证步骤：**

1. `make infra-up` + `make init-topics` + `make build`
2. 启动 4 个服务：simulator、ingest、data-writer、dispatch-core
3. 等待 10s，让 simulator 发若干轮遥测

**验证结果：**

| 项 | 结果 |
|---|---|
| simulator /health | ok |
| ingest /health | ok |
| data-writer /health | ok |
| dispatch-core /health | ok |
| PG vehicle_latest 行数 | >= 100 |
| PG vehicle_telemetry 行数 | >= 1000 |
| Redis vehicles:active | >= 100 |
| Redis vehicle:v-000001:latest | 有数据 |
| Prometheus target | 7 个 UP |
| 各服务 /metrics | 有数据 |

**未验证项：**

- 任务调度实机验证：dispatch-core 无 HTTP 端点，任务注入通过集成测试覆盖
- 告警流实机验证：geofence/anomaly 未接入 plugin-host，阶段四接入后实机验证

**结论：** 遥测流主干道实机跑通，核心服务在真实基础设施上能启动、健康、落库、可观测。
