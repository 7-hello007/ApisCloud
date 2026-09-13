# 路线优化插件 V1

## 一、功能目标

route-optimizer 是**进程内插件**，订阅 `telemetry.raw`（带 filter `status = running`），检测低速车，发 `dispatch` 指令（带优化标记）。

**定位：**

- 插件，不是核心服务
- 订阅原始遥测（因为需要单条数据的速度）
- 用 filter 减少无效调用
- 发 `events.commands` 给 ingest（转 MQTT）和 data-writer（审计）
- 幂等 + 冷却

**数据流：**

```
telemetry.raw (带 filter: status=running)
    │
    ▼
plugin-host.dispatchMessage
    │
    ├─ filter 拦截：status !== running 的跳过
    │
    ▼
route-optimizer.onMessage
    │
    ├─ 检测 speed < 15 km/h
    │
    ├─ 冷却检查（同车 3 分钟内不重复）
    │
    ├─ 构建 dispatch 指令
    │
    ▼
events.commands
    │
    ├─ ingest → MQTT commands/{vehicle_id}
    │
    └─ data-writer → PG dispatch_commands（审计）
```

## 二、基础实现

### 2.1 文件位置

```
plugins/route-optimizer/
├── plugin.json
└── src/
    ├── optimizer.js
    └── index.js
```

### 2.2 plugin.json

```json
{
  "name": "route-optimizer",
  "version": "1.0.0",
  "core": false,
  "profile": ["core", "full"],
  "lazy": true,
  "dependsOn": [],
  "topics": {
    "subscribe": ["telemetry.raw"],
    "publish": ["events.commands"],
    "filter": {
      "field": "status",
      "equals": "running"
    }
  },
  "routes": [],
  "frontend": null,
  "description": "路线优化：消费遥测，检测低速车，发优化指令"
}
```

**关键：**

- `subscribe: ["telemetry.raw"]`：订阅原始遥测，因为需要单条数据的速度。
- `filter`：在 plugin-host 层拦截，`idle` 车的消息不会进入插件。
- `lazy: true`：有订阅主题，所以会被自动激活。

### 2.3 filter 机制

plugin-host 的 `dispatchMessage` 检查 `manifest.topics.filter`：

| 模式 | 说明 |
|---|---|
| `equals` | 等值匹配：`payload.{field} === equals` |
| `in` | 成员匹配：`equals` 是数组时用 `in` |
| `field` | 支持点分路径，如 `status`、`position.lat` |

**route-optimizer 的 filter：**

```json
"filter": {
  "field": "status",
  "equals": "running"
}
```

**效果：** `idle` / `charging` / `maintenance` / `offline` 车的消息在 plugin-host 层就被拦截，不调 `onMessage`。

### 2.4 双层过滤

route-optimizer 用两层过滤：

**第一层（plugin-host filter）：** `status = running`

- 在 host 层拦截，减少无效调用。
- 由 `plugin.json` 声明，不改代码。

**第二层（插件逻辑）：** `speed < 15 km/h`

- 在 `shouldOptimize` 里判断。
- 因为速度是数值区间，filter 只能做等值匹配，所以要插件内部处理。

**两层结合：** idle 车完全不进入插件，running 车进入后只处理低速的。

### 2.5 纯逻辑模块 `optimizer.js`

| 函数 | 作用 |
|---|---|
| `shouldOptimize(telemetry, options)` | 判断是否触发优化（status=running 且 speed < 阈值） |
| `selectOptimizeCandidates(params)` | 从候选过滤出不在冷却期的车辆 |
| `buildOptimizeCommand(vehicleId, options)` | 构建 `DownlinkCommand` 结构的指令 |
| `pruneRecentCommands(recentCommands, now, maxAgeMs)` | 清理过期冷却记录 |

**默认常量：**

| 常量 | 值 | 说明 |
|---|---|---|
| `DEFAULT_LOW_SPEED_THRESHOLD` | 15 | 低速阈值（km/h） |
| `DEFAULT_SUGGESTED_SPEED` | 40 | 建议提升到的速度（km/h） |
| `DEFAULT_COOLDOWN_MS` | 180000（3 分钟） | 同车冷却时间 |

### 2.6 插件入口 `index.js`

| 钩子 | 行为 |
|---|---|
| `onLoad(ctx)` | 从 `ctx.bus` / `ctx.createEnvelope` / `ctx.topics` 拿依赖；读配置 |
| `onUnload()` | 清空 `recentCommands`，清依赖 |
| `onMessage(topic, env)` | 检测低速车，发 `events.commands` |
| `onTimer()` | 无定时任务 |
| `getRoutes()` | 返回 `[]`（不暴露 HTTP 端点） |
| `getHealth()` | 返回 `recent` 数和 `lowSpeed` 阈值 |

**`onMessage` 逻辑：**

1. 从 envelope 提取 telemetry。
2. 检查 `shouldOptimize`（status=running 且 speed < 阈值）。
3. 清理过期冷却记录。
4. 过滤候选（不在冷却期的）。
5. 构建优化指令。
6. 通过 `ctx.bus.publish` 发 `events.commands`。
7. 记录 `recentCommands.set(vehicleId, now)`。

### 2.7 幂等 + 冷却

- `recentCommands: Map<vehicle_id, timestamp>`。
- 同一车在 `cooldownMs`（默认 3 分钟）内不重复发指令。
- 每次处理前 `pruneRecentCommands`，清掉过期条目（`cooldownMs * 2`），避免 Map 无限增长。

**为什么是 3 分钟：**

- 路线优化不像充电那么紧急。
- 3 分钟内重复发指令会给外部系统带来无效负载。
- 3 分钟足够观察上次优化是否生效。

### 2.8 events.commands payload

```ts
{
  vehicle_id: string,
  command_id: uuid,
  command_type: 'dispatch',
  payload: {
    reason: 'route_optimize',
    optimization: 'speed_boost',
    current_speed: number,
    suggested_speed: number,
    issued_at: number
  }
}
```

**符合 ingest 的 `DownlinkCommandSchema`：**

| 字段 | 说明 |
|---|---|
| `vehicle_id` | 目标车辆 |
| `command_id` | UUID，幂等标识 |
| `command_type` | 固定 `'dispatch'` |
| `payload` | 优化详情 |

### 2.9 配置项

从环境变量读，带默认值：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `ROUTE_OPTIMIZER_LOW_SPEED_KMH` | 15 | 低速阈值 |
| `ROUTE_OPTIMIZER_SUGGESTED_SPEED_KMH` | 40 | 建议速度 |
| `ROUTE_OPTIMIZER_COOLDOWN_MS` | 180000 | 冷却时间 |

**配置注入方式：** `onLoad` 时从 `ctx.config` 或 `process.env` 读，缓存在模块变量里。

### 2.10 健康检查

```js
async getHealth() {
  return {
    status: 'ok',
    message: `recent: ${recentCommands.size}, lowSpeed: ${lowSpeedThreshold}`,
  };
}
```

`recent` 是当前还在冷却期的车辆数，`lowSpeed` 是低速阈值。

### 2.11 测试辅助

阶段五测试通过 `PluginHost` 分发，但也保留了直接测试的辅助方法：

| 方法 | 作用 |
|---|---|
| `setBus(b)` | 手动注入 bus |
| `_setHelpers(helpers)` | 手动注入 createEnvelope / topics |
| `_getRecentCommands()` | 查看冷却记录 |
| `_getConfig()` | 查看当前配置 |
| `_reset()` | 重置所有状态 |

### 2.12 测试覆盖

| 测试文件 | 用例数 | 覆盖 |
|---|---|---|
| `tests/routeOptimizer.optimizer.test.ts` | 9 | 纯逻辑 |
| `tests/routeOptimizer.plugin.test.ts` | 8 | PluginHost 分发 + filter |
| `tests/pluginHost.filter.test.ts` | 6 | filter 机制本身 |
| `tests/integration.pluginEcosystem.test.ts` | 9 | 完整插件生态 |

**关键测试：**

- `filter 通过的低速车触发优化指令`。
- `filter 不通过的消息不触发（idle）`。
- `running 但速度正常不触发`。
- `冷却期内同一车不重复触发`。
- `不同车各自独立`。
- `filter 直接拒绝 idle 车（在 dispatchMessage 层面拦截）`。

## 三、V1 修改

无（首版）。

## 四、后续版本

### 阶段六计划

- **真实路况数据接入：** 订阅 `environment.traffic` 主题，结合路况做优化。
- **多车协同优化：** 一批车的路线一起优化，避免局部最优。
- **A* 路径规划：** 从简单的速度提升到完整的路径重规划。
- **优化效果追踪：** 记录优化前后的速度对比，评估算法效果。

### 阶段六以后

- **DRL 调度：** 用深度强化学习做路线优化。
- **多目标优化：** 同时考虑时间、能耗、乘客体验。
- **实时地图集成：** 接高德/百度地图 API。
- **车路协同：** 结合 V2X 数据做全局优化。

## 五、关键设计说明

### 5.1 为什么订阅 `telemetry.raw` 而不是 `telemetry.aggregated`

**聚合遥测的局限：**

- `telemetry.aggregated` 只有 `avg_speed`，没有单车的 `speed`。
- route-optimizer 需要判断"这辆车速度低"，聚合后信息丢失。

**原始遥测的代价：**

- 1-10Hz 高频，流量大。
- 每个插件都订阅会压垮消息总线。

**解决方案：**

1. 用 filter 在 host 层拦截：只处理 `status = running` 的车。
2. 用冷却机制：同车 3 分钟内只处理一次。
3. 只有真正需要原始数据的插件才订阅 raw（route-optimizer 是其中之一）。

### 5.2 为什么用 `dispatch` 而不是新的 `optimize` 指令类型

**ingest 的 `DownlinkCommandSchema` 只要求 `command_type` 是字符串，理论上可以加 `optimize`。**

**但选择 `dispatch` 的理由：**

1. 语义上，路线优化也是一种调度指令。
2. `dispatch` 的 `payload` 是 `unknown`，可以放优化细节。
3. 外部系统对 `dispatch` 已经有处理逻辑，不需要新代码。
4. 用 `payload.optimization: 'speed_boost'` 区分优化类型。

### 5.3 双层过滤的性能收益

| 场景 | 单层过滤（插件内） | 双层过滤（host + 插件） |
|---|---|---|
| idle 车消息 | 每次都调 `onMessage` | host 层拦截，不调 |
| running 高速车 | 调 `onMessage` 后返回 | 调 `onMessage` 后返回 |
| running 低速车 | 处理并发指令 | 处理并发指令 |

**假设 500 辆车，其中 30% running：**

- 单层：每秒 500 次 `onMessage` 调用。
- 双层：每秒 150 次 `onMessage` 调用。

**减少 70% 的无效调用。**

### 5.4 与 charging-scheduler 的对比

| 维度 | charging-scheduler | route-optimizer |
|---|---|---|
| 订阅主题 | `telemetry.aggregated` | `telemetry.raw` |
| 触发条件 | `low_battery_vehicles` 非空 | `status=running 且 speed<15` |
| 冷却时间 | 5 分钟 | 3 分钟 |
| 指令类型 | `charge` | `dispatch` |
| filter | 无 | `status=running` |
| 是否需要原始数据 | 否（聚合已够） | 是（需要单车速度） |

### 5.5 兼容性

- `filter` 是可选字段，旧插件不受影响。
- `events.commands` payload 保持 `DownlinkCommand` 结构，ingest 和 data-writer 不需要改。
- 从 `ctx` 拿依赖，不 `require('@apiscloud/message-bus')`，插件真正独立可分发。