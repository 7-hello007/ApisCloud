# 充电调度插件 V1

## 一、功能目标

charging-scheduler 是**进程内插件**，订阅 `telemetry.aggregated`，从 `low_battery_vehicles` 拿候选，为每辆车发 `charge` 指令。

**定位：**

- 插件，不是核心服务
- 订阅聚合遥测（低频），不订阅原始遥测（高频）
- 发 `events.commands` 给 ingest（转 MQTT）和 data-writer（审计）
- 幂等 + 冷却，避免重复下发
- 进程内扩展，由 plugin-host 加载

**数据流：**

```
aggregator ──→ telemetry.aggregated ──→ charging-scheduler ──→ events.commands ──┬──→ ingest → MQTT commands/{vehicle_id}
                          │                                                       └──→ data-writer → PG dispatch_commands
                          │
                          └─ payload.low_battery_vehicles: ['v-1', 'v-2', ...]
```

**核心规则：**

- 只订阅 `telemetry.aggregated`，不订阅 `telemetry.raw`
- 所有依赖通过 `ctx` 注入，不 `require` workspace 包
- 同一车在冷却期内不重复发指令
- 每条指令带唯一 `command_id`，支持幂等
- 从 `ctx.bus` 发布，从 `ctx.createEnvelope` 构建信封，从 `ctx.topics` 拿主题

---

## 二、基础实现

### 2.1 文件位置

```
plugins/charging-scheduler/
├── plugin.json
└── src/
    ├── detectors.js      — 纯逻辑，无 I/O
    └── index.js          — 插件入口
```

### 2.2 plugin.json

```json
{
  "name": "charging-scheduler",
  "version": "1.0.0",
  "core": false,
  "profile": ["core", "full"],
  "lazy": true,
  "dependsOn": [],
  "topics": {
    "subscribe": ["telemetry.aggregated"],
    "publish": ["events.commands"]
  },
  "routes": [],
  "frontend": null,
  "description": "充电调度：消费聚合遥测，检测低电量，下发充电指令"
}
```

**关键字段：**

| 字段 | 值 | 说明 |
|---|---|---|
| `core` | false | 插件，不是核心服务 |
| `profile` | `["core", "full"]` | core 和 full profile 都加载 |
| `lazy` | true | 有订阅主题，会被激活 |
| `topics.subscribe` | `["telemetry.aggregated"]` | 只订阅聚合遥测 |
| `topics.publish` | `["events.commands"]` | 发指令事件 |
| `frontend` | null | 无前端模块 |

**符合性能策略：** 订阅聚合主题（低频），不订阅原始主题（高频）。

### 2.3 输入：AggregatedPayload

来自 aggregator 的聚合结果：

```ts
interface AggregatedPayload {
  region: string;
  window_start: number;
  window_end: number;
  vehicle_count: number;
  avg_speed: number;
  avg_battery: number;
  low_battery_vehicles: string[];   // 电量 < 阈值的车辆 ID 列表
  idle_vehicles: string[];
  region_center: { lat: number; lng: number };
}
```

**charging-scheduler 只关心 `low_battery_vehicles`。** 其他字段忽略。

### 2.4 输出：events.commands payload

结构与 ingest 的 `DownlinkCommand` 一致：

```ts
{
  vehicle_id: string,
  command_id: string,              // UUID
  command_type: 'charge',
  payload: {
    reason: 'low_battery',
    threshold: number,             // 低电量阈值
    issued_at: number,             // 签发时间戳（秒）
  }
}
```

**为什么用这个结构：**

- ingest 的 `DownlinkCommandSchema` 校验 `vehicle_id`、`command_id`、`command_type`、`payload`
- 只加字段不改结构，兼容旧版本
- `command_type: 'charge'` 与 ingest 的 `commands/{vehicle_id}` 下行一致

### 2.5 纯逻辑模块 `detectors.js`

**无 I/O，方便单测。**

#### 常量

| 常量 | 值 | 说明 |
|---|---|---|
| `DEFAULT_COOLDOWN_MS` | 300000 | 5 分钟冷却 |
| `DEFAULT_LOW_BATTERY_THRESHOLD` | 20 | 低电量阈值（%） |

#### 函数

**`selectChargingCandidates(params)`**

```js
function selectChargingCandidates(params) {
  const {
    lowBatteryVehicles,
    recentCommands,
    now,
    cooldownMs = DEFAULT_COOLDOWN_MS,
  } = params;

  return lowBatteryVehicles.filter((vehicleId) => {
    const last = recentCommands.get(vehicleId);
    if (last === undefined) return true;
    return now - last > cooldownMs;
  });
}
```

**作用：** 从候选列表中过滤出不在冷却期内的车辆。

**`buildChargeCommand(vehicleId, options)`**

```js
function buildChargeCommand(vehicleId, options) {
  const { threshold, now } = options;

  return {
    vehicle_id: vehicleId,
    command_id: randomUUID(),
    command_type: 'charge',
    payload: {
      reason: 'low_battery',
      threshold,
      issued_at: now,
    },
  };
}
```

**作用：** 构建符合 `DownlinkCommand` 结构的充电指令。

**`pruneRecentCommands(recentCommands, now, maxAgeMs)`**

```js
function pruneRecentCommands(recentCommands, now, maxAgeMs) {
  for (const [id, ts] of recentCommands.entries()) {
    if (now - ts > maxAgeMs) {
      recentCommands.delete(id);
    }
  }
}
```

**作用：** 清理过期冷却记录，避免 Map 无限增长。

### 2.6 插件入口 `index.js`

#### 内部状态

```js
const recentCommands = new Map();   // vehicle_id → 上次发指令时间戳
let bus = null;                     // 从 ctx.bus 注入
let createEnvelope = null;          // 从 ctx.createEnvelope 注入
let TOPICS = null;                  // 从 ctx.topics 注入
let lowBatteryThreshold = 20;       // 从配置读
let cooldownMs = 300000;            // 从配置读
```

#### 钩子

| 钩子 | 行为 |
|---|---|
| `onLoad(ctx)` | 从 `ctx` 拿 bus / createEnvelope / topics；从配置读阈值和冷却时间 |
| `onUnload()` | 清空 `recentCommands`，清空所有引用 |
| `onMessage(topic, env)` | 从 `low_battery_vehicles` 拿候选，过滤，构建指令，发布 |
| `onTimer()` | 无定时任务 |
| `getRoutes()` | 返回空数组 |
| `getHealth()` | 返回 `recent: N, threshold: T, cooldown: C` |

#### `onMessage` 处理流程

```
1. 检查 bus / createEnvelope / TOPICS 都已注入
2. 从 envelope.payload 取 low_battery_vehicles
3. 如果列表为空，直接返回
4. now = Date.now()
5. pruneRecentCommands(recentCommands, now, cooldownMs * 2)
6. candidates = selectChargingCandidates({ lowBatteryVehicles, recentCommands, now, cooldownMs })
7. 如果候选为空，直接返回
8. for each vehicleId in candidates:
     a. cmd = buildChargeCommand(vehicleId, { threshold, now })
     b. env = createEnvelope({ topic: TOPICS.EVENTS_COMMANDS, source: 'charging-scheduler', payload: cmd })
     c. await bus.publish(TOPICS.EVENTS_COMMANDS, env, { partitionKey: vehicleId })
     d. recentCommands.set(vehicleId, now)
```

**关键点：**

- `partitionKey = vehicleId`，Kafka 场景保证同车消息顺序
- `pruneRecentCommands` 用 `cooldownMs * 2` 作为最大保留时间，避免频繁清理
- 每辆车独立发一条指令，不批量

### 2.7 依赖注入

**不 require `@apiscloud/message-bus`：**

```js
// 错误做法（阶段三）
const { createEnvelope, TOPICS } = require('@apiscloud/message-bus');

// 正确做法（阶段四起）
async onLoad(ctx) {
  if (ctx.bus) bus = ctx.bus;
  if (ctx.createEnvelope) createEnvelope = ctx.createEnvelope;
  if (ctx.topics) TOPICS = ctx.topics;
}
```

**为什么：**

- 插件目录不在 pnpm workspace 里，`require` 找不到包
- 插件应该独立可分发，依赖通过 `ctx` 注入

### 2.8 配置项

从 `ctx.config` 或 `process.env` 读，带默认值：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `CHARGING_LOW_BATTERY_THRESHOLD` | 20 | 低电量阈值（%） |
| `CHARGING_COOLDOWN_MS` | 300000 | 冷却时间（5 分钟） |

`readIntEnv` 辅助函数：

```js
function readIntEnv(config, name, fallback) {
  const raw = config?.[name] ?? process.env[name];
  if (raw === undefined) return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
```

### 2.9 测试辅助方法

| 方法 | 作用 |
|---|---|
| `setBus(b)` | 手动注入 bus（不走 PluginHost 的测试用） |
| `_setHelpers(helpers)` | 手动注入 createEnvelope / topics |
| `_getRecentCommands()` | 查看冷却记录 |
| `_getConfig()` | 查看当前配置 |
| `_reset()` | 清空所有状态，回到初始值 |

**用途：** 测试直接调插件（不走 PluginHost）时用。生产走 `ctx` 注入。

### 2.10 幂等 + 冷却

**问题：** aggregator 每 5s 发一次 `telemetry.aggregated`，低电量车会持续出现在 `low_battery_vehicles`。如果不做冷却，每 5s 发一条充电指令，刷屏。

**解决：** `recentCommands: Map<vehicle_id, timestamp>`：

- 同一车在 `cooldownMs`（默认 5 分钟）内不重复发指令
- 每次处理前 `pruneRecentCommands` 清掉过期条目
- 内存占用与"过去 2 倍冷却时间内的活跃车数"成正比

**冷却时间选择：**

- 5 分钟足够一辆车从低电量状态开始充电
- 太短会刷屏，太长会漏掉真正需要充电的车
- 可通过环境变量调整

### 2.11 异常处理

- 每条消息独立 try/catch（`onMessage` 内不抛错）
- 检查 `bus` / `createEnvelope` / `TOPICS` 是否已注入，未注入则静默返回
- plugin-host 的 `dispatchMessage` 用 `withTimeout` 包裹，1s 超时

### 2.12 健康检查

```js
async getHealth() {
  return {
    status: 'ok',
    message: `recent: ${recentCommands.size}, threshold: ${lowBatteryThreshold}, cooldown: ${cooldownMs}`,
  };
}
```

`recent` 是当前冷却记录数，可作为监控指标。

---

## 三、V1 修改

无（首版）。

---

## 四、后续版本

### 计划中的 V2

- **考虑充电桩位置**：从 Redis 读充电桩列表，选最近的
- **充电桩排队长度**：避免多车挤同一充电桩
- **充电优先级**：按服务等级、任务紧急度排序

### 计划中的 V3

- **跨区域充电调度**：多个 aggregator 的区域数据，统一决策
- **动态冷却**：根据充电桩空闲情况调整冷却时间
- **指令回执**：外部系统返回 ack 后更新 `dispatch_commands.status`

### 长期演进

- **与调度算法协作**：充电调度和任务调度共享决策
- **电量预测**：预测未来 30 分钟的电量，提前充电
- **电池健康**：考虑电池循环次数、健康度

---

## 附录 A：完整代码示例

### A.1 `plugin.json`

```json
{
  "name": "charging-scheduler",
  "version": "1.0.0",
  "core": false,
  "profile": ["core", "full"],
  "lazy": true,
  "dependsOn": [],
  "topics": {
    "subscribe": ["telemetry.aggregated"],
    "publish": ["events.commands"]
  },
  "routes": [],
  "frontend": null,
  "description": "充电调度：消费聚合遥测，检测低电量，下发充电指令"
}
```

### A.2 `detectors.js`

```js
'use strict';

const { randomUUID } = require('node:crypto');

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_LOW_BATTERY_THRESHOLD = 20;

function selectChargingCandidates(params) {
  const {
    lowBatteryVehicles,
    recentCommands,
    now,
    cooldownMs = DEFAULT_COOLDOWN_MS,
  } = params;

  return lowBatteryVehicles.filter((vehicleId) => {
    const last = recentCommands.get(vehicleId);
    if (last === undefined) return true;
    return now - last > cooldownMs;
  });
}

function buildChargeCommand(vehicleId, options) {
  const { threshold, now } = options;

  return {
    vehicle_id: vehicleId,
    command_id: randomUUID(),
    command_type: 'charge',
    payload: {
      reason: 'low_battery',
      threshold,
      issued_at: now,
    },
  };
}

function pruneRecentCommands(recentCommands, now, maxAgeMs) {
  for (const [id, ts] of recentCommands.entries()) {
    if (now - ts > maxAgeMs) {
      recentCommands.delete(id);
    }
  }
}

module.exports = {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_LOW_BATTERY_THRESHOLD,
  selectChargingCandidates,
  buildChargeCommand,
  pruneRecentCommands,
};
```

### A.3 `index.js`

```js
'use strict';

const {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_LOW_BATTERY_THRESHOLD,
  selectChargingCandidates,
  buildChargeCommand,
  pruneRecentCommands,
} = require('./detectors');

const recentCommands = new Map();

let bus = null;
let createEnvelope = null;
let TOPICS = null;
let lowBatteryThreshold = DEFAULT_LOW_BATTERY_THRESHOLD;
let cooldownMs = DEFAULT_COOLDOWN_MS;

module.exports = {
  async onLoad(ctx) {
    if (ctx.bus) bus = ctx.bus;
    if (ctx.createEnvelope) createEnvelope = ctx.createEnvelope;
    if (ctx.topics) TOPICS = ctx.topics;

    const cfg = ctx.config ?? {};
    lowBatteryThreshold = readIntEnv(
      cfg,
      'CHARGING_LOW_BATTERY_THRESHOLD',
      DEFAULT_LOW_BATTERY_THRESHOLD,
    );
    cooldownMs = readIntEnv(cfg, 'CHARGING_COOLDOWN_MS', DEFAULT_COOLDOWN_MS);

    ctx.logger.info(
      {
        lowBatteryThreshold,
        cooldownMs,
        hasBus: !!bus,
        hasHelpers: !!createEnvelope && !!TOPICS,
      },
      'charging-scheduler 已加载',
    );
  },

  async onUnload() {
    recentCommands.clear();
    bus = null;
    createEnvelope = null;
    TOPICS = null;
  },

  async onMessage(_topic, envelope) {
    if (!bus || !createEnvelope || !TOPICS) return;

    const payload = envelope.payload;
    const lowBatteryVehicles = payload?.low_battery_vehicles ?? [];
    if (lowBatteryVehicles.length === 0) return;

    const now = Date.now();
    pruneRecentCommands(recentCommands, now, cooldownMs * 2);

    const candidates = selectChargingCandidates({
      lowBatteryVehicles,
      recentCommands,
      now,
      cooldownMs,
    });

    if (candidates.length === 0) return;

    for (const vehicleId of candidates) {
      const cmd = buildChargeCommand(vehicleId, {
        threshold: lowBatteryThreshold,
        now,
      });

      const env = createEnvelope({
        topic: TOPICS.EVENTS_COMMANDS,
        source: 'charging-scheduler',
        payload: cmd,
      });

      await bus.publish(TOPICS.EVENTS_COMMANDS, env, {
        partitionKey: vehicleId,
      });

      recentCommands.set(vehicleId, now);
    }
  },

  async onTimer() {},

  getRoutes() {
    return [];
  },

  async getHealth() {
    return {
      status: 'ok',
      message: `recent: ${recentCommands.size}, threshold: ${lowBatteryThreshold}, cooldown: ${cooldownMs}`,
    };
  },

  // ============================================================
  // 测试辅助
  // ============================================================

  setBus(b) {
    bus = b;
  },

  _setHelpers(helpers) {
    if (helpers.createEnvelope) createEnvelope = helpers.createEnvelope;
    if (helpers.topics) TOPICS = helpers.topics;
  },

  _getRecentCommands() {
    return recentCommands;
  },

  _getConfig() {
    return { lowBatteryThreshold, cooldownMs };
  },

  _reset() {
    recentCommands.clear();
    bus = null;
    createEnvelope = null;
    TOPICS = null;
    lowBatteryThreshold = DEFAULT_LOW_BATTERY_THRESHOLD;
    cooldownMs = DEFAULT_COOLDOWN_MS;
  },
};

function readIntEnv(config, name, fallback) {
  const raw = config?.[name] ?? process.env[name];
  if (raw === undefined) return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
```

---

## 附录 B：测试覆盖

### B.1 单元测试 `tests/chargingScheduler.detectors.test.ts`

覆盖：

- `selectChargingCandidates`：无冷却记录、冷却期内、超过冷却期、空列表
- `buildChargeCommand`：结构正确、唯一 command_id
- `pruneRecentCommands`：清理过期、空 Map 安全
- 默认值：`DEFAULT_COOLDOWN_MS`、`DEFAULT_LOW_BATTERY_THRESHOLD`

### B.2 集成测试 `tests/chargingScheduler.plugin.test.ts`

通过 `PluginHost` 分发：

- 插件加载后从 `ctx` 拿到 bus 和 helpers
- 无低电量车辆不发指令
- 有低电量车辆为每辆车发一条指令
- 同一车冷却期内不重复发
- 冷却期后重新发
- 多车多指令各自独立
- 命令 payload 结构正确
- 未订阅的主题不触发

### B.3 生态集成测试 `tests/integration.pluginEcosystem.test.ts`

完整链路：

```
telemetry.raw → aggregator → telemetry.aggregated → charging-scheduler → events.commands
                                                                              │
                                                                              ├──→ ingest → MQTT
                                                                              └──→ data-writer → PG dispatch_commands
```

覆盖：

- charging-scheduler 收到 aggregated 后发 charge 命令
- 完整链路跑通
- data-writer 写审计表
- 插件激活状态正确

---

## 附录 C：与其他模块的关系

### C.1 上游：aggregator

| 项 | 说明 |
|---|---|
| 主题 | `telemetry.aggregated` |
| 频率 | 每 5s 一次 |
| payload 关键字段 | `low_battery_vehicles: string[]` |
| 依赖 | charging-scheduler 只从 `low_battery_vehicles` 拿候选 |

### C.2 下游：ingest

| 项 | 说明 |
|---|---|
| 订阅 | `events.commands`，消费组 `apiscloud-ingest` |
| 处理 | 校验 `DownlinkCommandSchema` → MQTT `commands/{vehicle_id}` |
| 依赖 | charging-scheduler 发的 payload 必须过 schema |

### C.3 下游：data-writer

| 项 | 说明 |
|---|---|
| 订阅 | `events.commands`，消费组 `apiscloud-data-writer` |
| 处理 | `INSERT INTO dispatch_commands`，`status = 'pending'` |
| 依赖 | `command_id` 唯一，`ON CONFLICT DO NOTHING` 保证幂等 |

### C.4 调度算法插件

**与 nearest / batch-match / priority-dispatch 的关系：**

- 调度算法插件由 dispatch-core 直接调用（不走 plugin-host）
- charging-scheduler 走 plugin-host
- 两者独立，互不干扰

### C.5 gateway

| 项 | 说明 |
|---|---|
| 加载 | gateway 从 `plugins/charging-scheduler/` 加载 |
| 激活 | `lazy: true` + 有订阅主题 → 激活 |
| 分发 | gateway 的消息桥订阅 `telemetry.aggregated`，收到后 `dispatchMessage` 分发给 charging-scheduler |
| 消费者组 | `apiscloud-gateway`（共享单一组） |

---

## 附录 D：监控与观测

### D.1 健康检查

`getHealth()` 返回：

```json
{
  "status": "ok",
  "message": "recent: 5, threshold: 20, cooldown: 300000"
}
```

通过 gateway 的 `/health` 端点可见：

```bash
curl http://localhost:9101/health | jq '.checks["charging-scheduler"]'
```

### D.2 日志

插件通过 `ctx.logger` 输出：

| 时机 | 级别 | 内容 |
|---|---|---|
| 加载 | info | `lowBatteryThreshold`、`cooldownMs`、`hasBus`、`hasHelpers` |
| 处理 | 无（通过 bus 的指标记录） | — |

**未来可加**：每次发指令记 debug 日志。

### D.3 指标

复用 observability 的 `dataFlowMessages`：

| 指标 | 值 |
|---|---|
| `apiscloud_dataflow_messages_total{topic="events.commands",direction="out"}` | 发指令数 |

**未来可加**：

- `charging_scheduler_commands_total`：累计指令数
- `charging_scheduler_cooldown_hits_total`：冷却命中数

---

## 附录 E：常见问题

### E.1 为什么订阅 aggregated 不订阅 raw？

| 对比 | 订阅 raw | 订阅 aggregated |
|---|---|---|
| 频率 | 1-10Hz | 0.2Hz（5s 一次） |
| 单条数据 | 单车状态 | 区域聚合 |
| 过滤 | 需自己筛低电量 | aggregator 已筛好 |
| 资源 | 500 辆车 = 500 条/秒 | 1 条/5 秒 |
| 推荐 | ❌ | ✅ |

**符合 destination.md 的性能策略：** 新插件默认订阅聚合主题。

### E.2 为什么用 `low_battery_vehicles` 而不是自己判断？

- aggregator 已经做了筛选，charging-scheduler 只消费结果。
- 减少插件的计算量和代码复杂度。
- aggregator 是核心服务，筛选逻辑集中维护。

### E.3 冷却时间怎么调？

| 场景 | 建议 |
|---|---|
| 500 辆模拟 | 默认 5 分钟 |
| 10 万辆车 | 缩短到 1-2 分钟，避免积压 |
| 充电桩紧张 | 延长到 10 分钟，避免多车挤一起 |

通过 `CHARGING_COOLDOWN_MS` 环境变量调整，不用改代码。

### E.4 指令下发后怎么知道执行了？

**当前阶段：** 不跟踪。

**未来（阶段六）：**
- 外部系统返回 ack → ingest 发 `events.command_acks` → data-writer 更新 `dispatch_commands.status`
- 或者：超时未 ack → 重发或标记失败

### E.5 如果 bus 未注入会怎样？

`onMessage` 里先检查：

```js
if (!bus || !createEnvelope || !TOPICS) return;
```

静默返回，不抛错，不写日志。

**原因：** 测试环境可能不注入 bus，直接调 `onMessage` 也不应崩。

### E.6 如果 `low_battery_vehicles` 不是数组怎么办？

```js
const lowBatteryVehicles = payload?.low_battery_vehicles ?? [];
```

`?? []` 兜底，防止 `undefined` 或 `null` 抛错。

**如果传入的是非数组**：`filter` 会抛错，被 plugin-host 的 `withTimeout` 包裹捕获，记 error 日志，不影响其他插件。

---

## 附录 F：相关文档

| 文档 | 关系 |
|---|---|
| `docs/aggregator.V1.md` | 上游生产者 |
| `docs/ingest.V1.md` | 下游消费者（转 MQTT） |
| `docs/dataWriter.V1.md` | 下游消费者（审计） |
| `docs/gateway.V1.md` | 插件加载器 |
| `docs/pluginHost.V2.md` | 插件宿主 |
| `docs/busPerformance.V1.md` | 性能策略 |
| `docs/messageBus.V3.md` | 主题分层 |
| `docs/integration.pluginEcosystem.test.ts` | 生态集成测试 |