# 批量匹配调度算法 V1

## 一、功能目标

batch-match 是 dispatch-core 的**多因素成本最小化算法**，综合距离、电量、能力给车辆打分。

**适用场景：**

- 预约单
- 追求全局成本最优

**核心逻辑：** 成本 = 距离成本 - 电量加成 - 能力加成。成本越小得分越高。

## 二、基础实现

### 2.1 文件位置

```
plugins/dispatch/batch-match/
├── plugin.json
└── src/
    └── index.js
```

### 2.2 plugin.json

```json
{
  "name": "batch-match",
  "version": "1.0.0",
  "core": false,
  "profile": ["core", "full"],
  "lazy": true,
  "dependsOn": [],
  "topics": { "subscribe": [], "publish": [] },
  "routes": [],
  "frontend": null,
  "description": "批量匹配算法：多因素成本最小化（距离+电量+能力）"
}
```

### 2.3 算法输入输出

**输入：**

```ts
{
  task: DispatchTask,
  candidates: DispatchVehicle[],
  context?: Record<string, unknown>
}
```

**输出：**

```ts
{
  ranked: Array<{
    vehicle_id: string,
    score: number,       // -cost，越大越好
    reason: string       // "batch-match: cost=0.123 distance=1.23km battery=80"
  }>
}
```

### 2.4 核心逻辑

```
REFERENCE_DISTANCE_KM = 50
W_BATTERY = 0.3
W_CAPABILITY = 0.2

for each vehicle in candidates:
  distance = Haversine(task.origin, vehicle.position)
  distanceCost = distance / REFERENCE_DISTANCE_KM
  batteryScore = vehicle.battery / 100
  capabilityScore = (capabilities 为空 或 包含 task_type) ? 1 : 0

  cost = distanceCost - W_BATTERY * batteryScore - W_CAPABILITY * capabilityScore
  score = -cost

  ranked.push({ vehicle_id, score, reason })

ranked.sort((a, b) => b.score - a.score)
return { ranked }
```

### 2.5 得分语义

| 因素 | 影响 |
|---|---|
| 距离近 | 成本降低 → 得分升高 |
| 电量高 | 成本降低 → 得分升高 |
| 能力匹配 | 成本降低 → 得分升高 |

**归一化说明：**

- `distanceCost = distance / 50`，把距离映射到 [0, +∞)
- `batteryScore = battery / 100`，把电量映射到 [0, 1]
- `capabilityScore ∈ {0, 1}`，0 或 1

三者的量级经过归一化后可以加权相加。

### 2.6 Haversine 实现

```
EARTH_RADIUS_KM = 6371

distanceKm(a, b):
  dLat = (b.lat - a.lat) * π / 180
  dLng = (b.lng - a.lng) * π / 180
  lat1 = a.lat * π / 180
  lat2 = b.lat * π / 180

  h = sin²(dLat/2) + cos(lat1) * cos(lat2) * sin²(dLng/2)
  return 2 * EARTH_RADIUS_KM * asin(√h)
```

算法插件自包含实现，不依赖 simulator 包。

### 2.7 与 nearest 的差异

| 维度 | nearest | batch-match |
|---|---|---|
| 距离 | 唯一因素 | 主要因素 |
| 电量 | 不考虑 | 加成 0.3 |
| 能力 | 不考虑 | 加成 0.2 |
| 计算量 | 更低 | 略高 |
| 适用 | 实时单 | 预约单 |

### 2.8 阶段三简化说明

阶段三 dispatch-core 一次传一个任务。batch-match 当前对单个任务做多因素打分。

**未来扩展：** 若任务是一批，可改为匈牙利算法 / 最小成本流，做全局最优匹配。

### 2.9 复杂度

- 时间：O(n log n)
- 空间：O(n)

500 辆车时，单次调度 < 2ms。

### 2.10 算法特点

| 优点 | 缺点 |
|---|---|
| 多因素综合，结果更合理 | 权重是经验值，需要调优 |
| 兼顾距离、电量、能力 | 不考虑全局（多任务）最优 |
| 适合预约单 | 计算量比 nearest 略高 |

## 三、V1 修改

无（首版）。

## 四、后续版本

- 阶段五：一批任务 + 一批车辆全局最优（匈牙利算法）
- 阶段五：可配置权重（距离/电量/能力）
- 阶段五：加入 ETA 因素
- 阶段六：考虑路况
- 阶段六：考虑服务等级差异化权重