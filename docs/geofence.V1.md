# 地理围栏插件 V1

## 一、功能目标

geofence 是**进程内插件**，订阅 `telemetry.raw`，检测车辆进出围栏，产生 `events.alerts`。

**定位：**

- 插件，不是核心服务
- 阶段三只写插件代码 + 测试
- 阶段四由 plugin-host 注入 bus 后自动生效
- 只做围栏检测，不做其他

**核心规则：**

- 只订阅 `telemetry.raw`，只发布 `events.alerts`
- 首次观测不告警，只记录状态（避免服务重启误报）
- 状态无变化不告警
- 状态变化时按 `alertOnEnter` / `alertOnExit` 决定是否告警

## 二、基础实现

### 2.1 文件位置

```
plugins/geofence/
├── plugin.json
├── zones.json
└── src/
    ├── geofence.js    — 纯逻辑
    └── index.js       — 插件入口
```

### 2.2 plugin.json

```json
{
  "name": "geofence",
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
  "description": "地理围栏检测：圆形区域进出告警"
}
```

### 2.3 zones.json

```json
{
  "zones": [
    {
      "id": "zone-shanghai",
      "name": "上海运营区域",
      "type": "circle",
      "center": { "lat": 31.2304, "lng": 121.4737 },
      "radiusKm": 30,
      "alertOnExit": true,
      "alertOnEnter": false
    }
  ]
}
```

字段：

| 字段 | 说明 |
|---|---|
| id | 围栏唯一标识 |
| name | 显示名 |
| type | 目前只支持 `circle` |
| center | 圆心 |
| radiusKm | 半径 km |
| alertOnExit | 出围栏时是否告警 |
| alertOnEnter | 进围栏时是否告警 |

### 2.4 纯逻辑模块 `geofence.js`

导出 3 个函数：

| 函数 | 作用 |
|---|---|
| `distanceKm(a, b)` | Haversine 距离 |
| `isInsideZone(point, zone)` | 判断点是否在围栏内 |
| `detectZoneTransition(params)` | 检测围栏状态变化 |

`detectZoneTransition` 参数：

```ts
{
  vehicleId: string,
  position: GeoPoint,
  prevInside: boolean | null,   // null 表示首次
  zone: Zone
}
```

返回：

```ts
null | {
  type: 'enter' | 'exit',
  zoneId: string,
  zoneName: string,
  alertType: 'geofence_enter' | 'geofence_exit',
  level: 'info' | 'warning',
  message: string
}
```

### 2.5 状态转移逻辑

| prevInside | nowInside | alertOnExit | alertOnEnter | 结果 |
|---|---|---|---|---|
| null | 任意 | — | — | null（首次） |
| true | true | — | — | null |
| false | false | — | — | null |
| true | false | true | — | exit 告警 |
| true | false | false | — | null |
| false | true | — | true | enter 告警 |
| false | true | — | false | null |

### 2.6 插件入口 `index.js`

| 钩子 | 行为 |
|---|---|
| `onLoad(ctx)` | 读 `zones.json`，缓存 |
| `onUnload()` | 清空状态 |
| `onMessage(topic, envelope)` | 判断进出，发 `events.alerts` |
| `getHealth()` | 返回 zones 数量 |
| `setBus(bus)` | 阶段四由 plugin-host 注入 |

### 2.7 状态管理

内部维护 `Map<vehicle_id, Map<zone_id, boolean>>`，记录每辆车在每个围栏内的状态。

**阶段三不做清理**，车辆 Map 会一直增长。阶段五/六可加 LRU 或 TTL。

### 2.8 events.alerts payload

```ts
{
  vehicle_id: string,
  alert_type: 'geofence_exit' | 'geofence_enter',
  level: 'warning' | 'info',
  message: string,
  payload: {
    zone_id: string,
    zone_name: string
  }
}
```

与 data-writer 的 `AlertPayload` 一致，data-writer 自动写 PG alerts 和 Redis alerts:recent。

### 2.9 阶段四接入方式

阶段四在 plugin-host 的 `buildContext` 里注入 `bus`，插件在 `onLoad` 里调 `setBus(ctx.bus)` 缓存起来。

阶段三测试通过 `_setBus` 或 `setBus` 注入 mock bus。

## 三、V1 修改

无（首版）。

## 四、后续版本

- 阶段四：接入 plugin-host，由 ctx.bus 自动注入
- 阶段五：支持多边形围栏
- 阶段五：支持多个围栏叠加
- 阶段五：状态 Map LRU 清理
- 阶段六：从远端配置动态加载 zones.json