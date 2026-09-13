# 异常检测插件 V1

## 一、功能目标

anomaly 是**进程内插件**，订阅 `telemetry.raw`，检测速度异常和电量骤降，产生 `events.alerts`。

**定位：**

- 插件，不是核心服务
- 阶段三只写插件代码 + 测试
- 阶段四由 plugin-host 注入 bus 后自动生效
- 只做阈值检测，不做机器学习

**核心规则：**

- 只订阅 `telemetry.raw`，只发布 `events.alerts`
- 速度超阈值 → 告警
- 电量在时间窗内骤降 → 告警
- 无上一状态时不做电量骤降判断

## 二、基础实现

### 2.1 文件位置

```
plugins/anomaly/
├── plugin.json
└── src/
    ├── detectors.js    — 纯逻辑
    └── index.js        — 插件入口
```

### 2.2 plugin.json

```json
{
  "name": "anomaly",
  "version": "1.0.0",
  "core": false,
  "profile": ["core", "full"],
  "lazy": true,
  "dependsOn": [],
  "topics": {
    "subscribe": ["telemetry.raw"],
    "publish": ["events.alerts"]
  },
  "routes": [],
  "frontend": null,
  "description": "异常检测：速度超阈值 + 电量骤降"
}
```

### 2.3 检测项

**速度异常：**

- 阈值：默认 120 km/h（`ANOMALY_SPEED_THRESHOLD_KMH`）
- 超过阈值 → 告警 `speed_anomaly`，level `warning`

**电量骤降：**

- 时间窗：默认 30s（`ANOMALY_BATTERY_DROP_WINDOW_MS`）
- 下降幅度：默认 15%（`ANOMALY_BATTERY_DROP_PERCENT`）
- 同时满足 → 告警 `battery_drop`，level `critical`
- 无上一状态时不判断

### 2.4 纯逻辑模块 `detectors.js`

导出：

| 函数 | 作用 |
|---|---|
| `DEFAULT_CONFIG` | 默认配置 |
| `checkSpeed(vehicleId, speed, config)` | 速度检测 |
| `checkBatteryDrop(vehicleId, currentBattery, previous, currentTs, config)` | 电量骤降检测 |
| `detectAnomalies(params)` | 综合检测，返回告警数组 |

`detectAnomalies` 参数：

```ts
{
  vehicleId: string,
  current: { ts: number, speed: number, battery: number },
  previous: { battery: number, ts: number } | null,
  config: AnomalyConfig
}
```

### 2.5 插件入口 `index.js`

| 钩子 | 行为 |
|---|---|
| `onLoad(ctx)` | 从 env 读配置，缓存 |
| `onUnload()` | 清空状态 |
| `onMessage(topic, envelope)` | 检测异常，发 `events.alerts` |
| `getHealth()` | 返回 tracked vehicles 数量 |
| `setBus(bus)` | 阶段四由 plugin-host 注入 |

### 2.6 状态管理

内部维护 `Map<vehicle_id, { battery, ts }>`，记录每辆车上一状态。

**阶段三不做清理**，Map 会一直增长。阶段五/六可加 LRU 或 TTL。

### 2.7 events.alerts payload

**速度异常：**

```ts
{
  vehicle_id: string,
  alert_type: 'speed_anomaly',
  level: 'warning',
  message: string,
  payload: {
    speed: number,
    threshold: number
  }
}
```

**电量骤降：**

```ts
{
  vehicle_id: string,
  alert_type: 'battery_drop',
  level: 'critical',
  message: string,
  payload: {
    previousBattery: number,
    currentBattery: number,
    drop: number,
    windowMs: number
  }
}
```

与 data-writer 的 `AlertPayload` 一致。

### 2.8 配置项

从环境变量读，带默认值：

| 环境变量 | 默认值 |
|---|---|
| ANOMALY_SPEED_THRESHOLD_KMH | 120 |
| ANOMALY_BATTERY_DROP_PERCENT | 15 |
| ANOMALY_BATTERY_DROP_WINDOW_MS | 30000 |

### 2.9 阶段四接入方式

同 geofence，阶段四由 plugin-host 注入 `bus`。

## 三、V1 修改

无（首版）。

## 四、后续版本

- 阶段四：接入 plugin-host，由 ctx.bus 自动注入
- 阶段五：更多检测项（航向突变、位置跳变、长时间静止）
- 阶段五：可配置检测项开关
- 阶段五：状态 Map LRU 清理
- 阶段六：时间序列异常检测（EWMA、Z-score）