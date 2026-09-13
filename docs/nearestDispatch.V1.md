# 最近邻调度算法 V1

## 一、功能目标

nearest 是 dispatch-core 的**默认调度算法**，按空间距离最近优先调度车辆。

**适用场景：**

- 实时单
- 追求最低 pickup 时间

**核心逻辑：** 计算每辆车到任务起点的 Haversine 距离，距离最近得分最高。

**核心规则：**

- 只依赖任务和候选车辆，无外部 I/O
- 输入输出确定，方便单测
- 返回按得分降序排列的候选
- 得分越大越好

## 二、基础实现

### 2.1 文件位置

```
plugins/dispatch/nearest/
├── plugin.json
└── src/
    └── index.js
```

### 2.2 plugin.json

```json
{
  "name": "nearest",
  "version": "1.0.0",
  "core": false,
  "profile": ["core", "full"],
  "lazy": true,
  "dependsOn": [],
  "topics": {
    "subscribe": [],
    "publish": []
  },
  "routes": [],
  "frontend": null,
  "description": "最近邻调度算法：Haversine 距离排序"
}
```

**说明：**

- `core: false`：是插件，不是核心服务。
- `profile: ["core", "full"]`：`make start PROFILE=core` 时也加载，保证 dispatch-core 有算法可用。
- `lazy: true`：默认懒加载。
- `topics.subscribe` / `topics.publish` 为空：算法插件不走总线，由 dispatch-core 直接调用。

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
    score: number,       // -distanceKm，越大越好
    reason: string       // "nearest: distance=1.23km"
  }>
}
```

### 2.4 核心逻辑

```
for each vehicle in candidates:
  distance = Haversine(task.origin, vehicle.position)
  score = -distance
  ranked.push({ vehicle_id, score, reason })

ranked.sort((a, b) => b.score - a.score)
return { ranked }
```

**说明：**

- 得分 = 距离的负值。距离越近，得分越高。
- 排序后 dispatch-core 只取 `ranked[0]`。
- 空候选列表返回空 `ranked`。

### 2.5 Haversine 实现

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

与 simulator 的 `gps-generator.ts` 一致。**算法插件自包含实现，不依赖 simulator 包**，理由是：

- simulator 包含状态机、车队、MQTT 发布器等无关代码，引入会带来不必要的依赖。
- Haversine 只有约 20 行，自包含成本低。
- 保持算法插件的纯函数属性，方便单测。

### 2.6 完整实现代码

```js
'use strict';

/**
 * 最近邻调度算法。
 * 输入：{ task, candidates }
 * 输出：{ ranked: [{ vehicle_id, score, reason }] }
 * 得分规则：距离越近得分越高（score = -distanceKm）。
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine 距离（km）。
 */
function distanceKm(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

module.exports = {
  algorithm: {
    name: 'nearest',
    version: '1.0.0',

    rank(input) {
      const { task, candidates } = input;

      const ranked = candidates
        .map((vehicle) => {
          const distance = distanceKm(task.origin, vehicle.position);
          return {
            vehicle_id: vehicle.vehicle_id,
            score: -distance,
            reason: `nearest: distance=${distance.toFixed(2)}km`,
          };
        })
        .sort((a, b) => b.score - a.score);

      return { ranked };
    },
  },
};
```

### 2.7 复杂度

- 时间：O(n log n)，n 为候选车辆数。
- 空间：O(n)。

500 辆车时，单次调度 < 1ms。

### 2.8 算法特点

| 优点 | 缺点 |
|---|---|
| 简单、快 | 不考虑电量、能力 |
| 结果稳定可预测 | 只看 pickup 距离，不看全局最优 |
| 适合实时单 | 高峰时段可能导致车辆扎堆 |
| 无状态，易测试 | 不感知时间窗约束（由 dispatch-core 硬约束负责） |

### 2.9 与 dispatch-core 的配合

| 环节 | 由谁负责 |
|---|---|
| 硬约束过滤（状态、电量、能力、地理、时间窗） | dispatch-core |
| 算法排序 | nearest 插件 |
| 取最优 | dispatch-core |
| 命令构建 + 签名 | dispatch-core |
| 发布 `events.commands` | dispatch-core |

**nearest 只负责排序，不负责过滤、不负责命令、不负责发布。**

### 2.10 加载方式

dispatch-core 的 `algorithm-loader.ts` 从 `plugins/dispatch/nearest/` 读 `src/index.js`，取 `module.exports.algorithm`。

加载后注册到 `AlgorithmRegistry`，名字为 `nearest`。

dispatch-core 配置 `DISPATCH_ALGORITHM=nearest` 时选中。

### 2.11 失败与回退

- 算法内部抛错 → dispatch-core 捕获 → 回退到 `DISPATCH_FALLBACK_ALGORITHM`。
- 算法超时（默认 500ms）→ dispatch-core 捕获 → 回退。
- 回退算法也是 nearest 时，不再二次回退。

### 2.12 测试覆盖

`tests/dispatch.nearest.test.ts` 覆盖：

| 用例 | 验证 |
|---|---|
| 从插件目录加载 nearest | 名称、版本 |
| 距离最近的车得分最高 | 3 辆车排序 |
| 返回结果按得分降序 | 遍历检查单调性 |
| 无候选返回空列表 | `ranked = []` |

## 三、V1 修改

无（首版）。

## 四、后续版本

- **阶段五：** 加入 ETA 而非纯距离。当前 score = -distance，未来可改为 -distance / avgSpeed 或 -eta。
- **阶段五：** 按车辆能力过滤（capabilities 前置）。当前由 dispatch-core 硬约束负责，未来算法内可再做一次校验。
- **阶段五：** 加入服务等级权重，不同 service_level 用不同距离衰减曲线。
- **阶段六：** 考虑实时路况，距离改为路网距离而非直线距离。
- **阶段六：** 多目标排序（距离 + 电量 + 时间窗紧急性）。