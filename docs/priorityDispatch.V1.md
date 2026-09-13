# 优先级调度算法 V1

## 一、功能目标

priority-dispatch 是 dispatch-core 的**优先级动态权重算法**，根据任务优先级动态调整距离和电量的权重。

**适用场景：**

- 紧急任务（如救援）
- 服务等级差异明显的场景

**核心逻辑：**

- 优先级高（接近 100）→ 更重视距离（快速到达）
- 优先级低（接近 0）→ 更重视电量（节省能耗）

## 二、基础实现

### 2.1 文件位置

```
plugins/dispatch/priority-dispatch/
├── plugin.json
└── src/
    └── index.js
```

### 2.2 plugin.json

```json
{
  "name": "priority-dispatch",
  "version": "1.0.0",
  "core": false,
  "profile": ["core", "full"],
  "lazy": true,
  "dependsOn": [],
  "topics": { "subscribe": [], "publish": [] },
  "routes": [],
  "frontend": null,
  "description": "优先级调度算法：优先级动态调整距离/电量权重"
}
```

### 2.3 权重公式

```
priorityNorm = clamp(task.priority / 100, 0, 1)
distanceWeight = 0.2 + priorityNorm * 0.8   // 0.2 ~ 1.0
batteryWeight  = 1.0 - distanceWeight       // 0.8 ~ 0.0
```

| 优先级 | 距离权重 | 电量权重 |
|---|---|---|
| 0（最低） | 0.2 | 0.8 |
| 50（中） | 0.6 | 0.4 |
| 100（最高） | 1.0 | 0.0 |

权重和为 1，归一化清晰。

### 2.4 得分公式

```
score = distanceWeight * (-distance/50)
      + batteryWeight * (battery/100)
```

### 2.5 行为验证

**高优先级任务（priority=100）：**

| 车辆 | 距离 | 电量 | 距离项 | 电量项 | 得分 |
|---|---|---|---|---|---|
| v-near-lowbat | 0.07km | 30% | -0.0014 | 0 | -0.0014 |
| v-far-highbat | 45km | 100% | -0.9 | 0 | -0.9 |

→ v-near-lowbat 胜出（距离主导）

**低优先级任务（priority=0）：**

| 车辆 | 距离 | 电量 | 距离项 | 电量项 | 得分 |
|---|---|---|---|---|---|
| v-near-lowbat | 0.07km | 30% | -0.0003 | 0.24 | 0.2397 |
| v-far-highbat | 45km | 100% | -0.18 | 0.80 | 0.62 |

→ v-far-highbat 胜出（电量主导）

### 2.6 复杂度

- 时间：O(n log n)
- 空间：O(n)

### 2.7 与 nearest / batch-match 的差异

| 维度 | nearest | batch-match | priority-dispatch |
|---|---|---|---|
| 距离 | 唯一 | 主要 | 动态 |
| 电量 | 无 | 加成 | 动态 |
| 优先级 | 无 | 无 | 动态 |
| 适用 | 实时单 | 预约单 | 紧急任务 |

## 三、V1 修改

无（首版）。

## 四、后续版本

- 阶段五：多任务优先级抢占
- 阶段五：可配置权重曲线
- 阶段六：按服务等级细分权重