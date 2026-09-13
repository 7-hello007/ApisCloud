# 一、告警流集成测试经验总结

## 1. 完成了什么

新增 **1 个集成测试文件**：`tests/integration.alertFlow.test.ts`，**13 个测试**，覆盖 geofence 和 anomaly 两个插件的告警流端到端。

**覆盖的链路：**

```
telemetry.raw
    │
    ▼
geofence.onMessage / anomaly.onMessage
    │
    ├─ 检测逻辑（纯函数）
    │
    ├─ 通过 ctx.bus 发 events.alerts
    │
    ▼
data-writer 订阅 events.alerts
    │
    ├─ INSERT INTO alerts（PG）
    │
    └─ LPUSH alerts:recent + LTRIM（Redis）
```

**测试用例：**

| 分组 | 用例 | 验证 |
|---|---|---|
| geofence | 从内到外触发告警，写 PG alerts | 参数：vehicle_id / alert_type / level / message |
| geofence | 首次观测不告警 | 无 alertInserts |
| geofence | 一直在内不告警 | 无 alertInserts |
| geofence | 同时写 PG 和 Redis alerts:recent | 验证 lpush + ltrim |
| anomaly 速度 | 速度超阈值告警，写 PG alerts | 参数含 150 |
| anomaly 速度 | 速度正常不告警 | 无 alertInserts |
| anomaly 电量 | 时间窗内骤降告警 | level=critical |
| anomaly 电量 | 无上一状态不告警 | 无 alertInserts |
| anomaly 电量 | 小幅下降不告警 | 无 alertInserts |
| anomaly 电量 | 超出时间窗不告警 | 无 alertInserts |
| 混合 | geofence + anomaly 同时告警 | 2 条到 PG |
| 混合 | 多车多告警 | 3 辆车的告警都到 PG |
| 混合 | 告警 payload 结构正确 | 5 个参数，类型正确 |

**测试结果：**

- `make test-integration`：3 个 suite 全绿（mqttToPg + dispatchFlow + alertFlow）
- `make test-unit`：45 个 suite 全绿

## 2. 怎么完成的

**核心思路：** 插件不走 plugin-host，直接 require 插件模块手动触发 `onMessage`；共享 MemoryAdapter，让插件的 `bus.publish` 和 data-writer 的 `bus.subscribe` 互通。

**关键步骤：**

**第一步：直接 require 插件模块。**

```ts
const geofence = require(path.resolve(__dirname, '..', 'plugins', 'geofence', 'src', 'index.js'));
const anomaly = require(path.resolve(__dirname, '..', 'plugins', 'anomaly', 'src', 'index.js'));
```

插件是 CommonJS，直接 require 拿到模块对象（含 `onLoad` / `onMessage` / `setBus` / `_reset` 等）。

**第二步：Mock PG 和 Redis 记录操作。**

- MockPg 的 `query` 检查 SQL 里含 `INSERT INTO alerts`，把参数存到 `alertInserts`。
- MockRedis 的 `raw()` 返回一个带 `lpush` / `ltrim` 的对象，记录到 `lpushes` / `ltrims`。

**第三步：构造 ctx 并加载插件。**

```ts
const ctx = {
  pluginId: 'test',
  logger: createLogger({ service: 'test', level: 'silent' }),
  config: loadConfig(),
};

await geofence.onLoad(ctx);
await anomaly.onLoad(ctx);

geofence.setBus(bus);
anomaly.setBus(bus);
```

**第四步：启动 data-writer，订阅 events.alerts。**

```ts
dataWriter = createDataWriterService({
  config: loadConfig({ SERVICE_NAME: 'data-writer' }),
  port: 0,
  pg: mockPg,
  redis: mockRedis,
  bus,
});

await dataWriter.start();
```

**第五步：手动触发 onMessage，模拟遥测。**

```ts
async function feedGeofence(vehicleId, overrides) {
  const env = createEnvelope({
    topic: TOPICS.TELEMETRY_RAW,
    source: 'simulator',
    payload: makeTelemetryPayload(vehicleId, overrides),
  });
  await geofence.onMessage(TOPICS.TELEMETRY_RAW, env);
}
```

**第六步：用 waitFor 等异步落库。**

```ts
await waitFor(() => mockPg.alertInserts.length >= 1);
```

**第七步：每个测试前后用 `_reset` 清理插件状态。**

```ts
beforeEach(async () => {
  geofence._reset();
  anomaly._reset();
  // ...
});

afterEach(async () => {
  await dataWriter.stop();
  geofence._reset();
  anomaly._reset();
});
```

**关键点：**

- **`_reset` 清状态**：插件内部的 `vehicleZoneState` / `vehiclePrevState` Map 在测试间要清，避免互相污染。
- **`setBus` 注入**：插件没有 plugin-host 提供的 `ctx.bus`，阶段三测试手动注入。
- **await onMessage**：插件内部 `await bus.publish(...)`，publish 是 `await Promise.all(handler)`，所以 `await onMessage` 返回时 handler 已完成，可以直接检查。
- **waitFor 兜底**：即使 publish 是同步等待，`waitFor` 更稳。

## 3. 遇到的问题及解决

**没有遇到阻塞性问题，一次通过。**

几个小细节：

**细节一：插件用 `_reset` 而不是 `_setBus`。**

`geofence` / `anomaly` 的测试辅助方法名统一为：

- `setBus(bus)`：注入总线
- `_reset()`：清状态 + 清总线
- `_getZones()` / `_getVehicleZoneState()`：查看内部状态（调试用）

`_reset` 同时清 `vehicleZoneState` 和 `bus`，保证每个测试独立。

**细节二：MockRedis 的 `raw()` 返回对象要包含 `lpush` 和 `ltrim`。**

`data-writer` 的 `writeRecentAlert` 用的是 `redis.raw().lpush()` 和 `redis.raw().ltrim()`，不是 `RedisWrapper` 的封装方法。所以 Mock 必须提供这两个。

**细节三：告警参数顺序与 `alertToPgParams` 一致。**

`alertToPgParams` 返回 5 个参数：

```
[vehicle_id, alert_type, level, message, payload]
```

测试断言严格按这个顺序。

---

# 二、阶段三任务回顾（与 destination.md 一致）

## 阶段三：核心业务服务与调度算法

**阶段目标：** 实现智能驾驶服务调度的核心业务能力，融入多维度调度算法。

**实现思路：**

- dispatch-core 负责任务分发，调度算法以插件形式提供。
- 实现调度算法插件：最近邻、批量匹配、优先级调度。
- geofence 做地理围栏检测（插件）。
- anomaly 做阈值异常检测（插件）。
- 查询走 Redis 热路径，不直接从消息总线全量消费。
- 服务与层分离，同一服务可在任意层部署。

**具体任务：**

| 序号 | 任务 | 怎么完成 | 产出 | 状态 |
|---|---|---|---|---|
| 3.1 | 开发 dispatch-core | 任务分发框架，算法插件接口 | `core/services/dispatch-core/` | ✅ |
| 3.2 | 开发 nearest-dispatch | 最近邻算法 | `plugins/dispatch/nearest/` | ✅ |
| 3.3 | 开发 batch-match | 批量匹配算法 | `plugins/dispatch/batch-match/` | ✅ |
| 3.4 | 开发 priority-dispatch | 优先级调度算法 | `plugins/dispatch/priority-dispatch/` | ✅ |
| 3.5 | 开发 geofence | zones.json 配置 + 圆形区域检测 | `plugins/geofence/` | ✅ |
| 3.6 | 开发 anomaly | 速度阈值 + 电量骤降检测 | `plugins/anomaly/` | ✅ |
| 3.7 | 编写调度算法测试 | 每个算法的单元测试 | `dispatch.*.test.js` | ✅ |
| 3.8 | 编写 geofence 测试 | 单元测试：围栏检测、边界 | `geofence.zoneDetection.test.js` | ✅ |
| 3.9 | 编写 anomaly 测试 | 单元测试：速度、电量阈值 | `anomaly.speedThreshold.test.js` | ✅ |
| 3.10 | 编写集成测试 | 调度流、告警流 | `integration.dispatchFlow.test.js`、`integration.alertFlow.test.js` | ✅ |
| 3.11 | 编写功能文档 | 每个功能一个文档 | `dispatchCore.V1.md` 等 | ✅ |

**阶段验收：** 车辆能收到派单指令，告警能正确产生并存储，调度算法可用，集成测试通过。

| 验收项 | 证据 | 状态 |
|---|---|---|
| 车辆能收到派单指令 | `integration.dispatchFlow.test.ts` 验证 MQTT `commands/v-NNNNNN` | ✅ |
| 告警能正确产生并存储 | `integration.alertFlow.test.ts` 验证 PG alerts + Redis alerts:recent | ✅ |
| 调度算法可用 | 3 个算法插件 + 单测 + 集成测试 | ✅ |
| 集成测试通过 | 3 个集成 suite 全绿 | ✅ |

**阶段文档：**

| 文档 | 状态 |
|---|---|
| `docs/dispatchCore.V1.md` | ✅ |
| `docs/geofence.V1.md` | ✅ |
| `docs/anomaly.V1.md` | ✅ |

**额外补充文档：**

| 文档 | 状态 |
|---|---|
| `docs/nearestDispatch.V1.md` | ✅ |
| `docs/batchMatch.V1.md` | ✅ |
| `docs/priorityDispatch.V1.md` | ✅ |

**里程碑 M3 验收标准：** 派单、告警正常，调度算法可用，集成测试通过。 ✅ 全部达成。

---

## 阶段三最终产出清单

| 批次 | 内容 | 文件数 |
|---|---|---|
| 第一批 | 根配置 + dispatch-core 骨架 | 12 |
| 第二批 | dispatch-core 核心逻辑 | 10 |
| 第三批 | 3 个算法插件 + 测试 | 9 |
| 第四批 | geofence、anomaly 插件 + 测试 | 9 |
| 第五批 | data-writer 扩展 | 8 |
| 第六批 | 调度流集成测试 | 1 |
| 第七批 | 6 个文档 + README 更新 | 7 |
| 收尾 | 告警流集成测试 | 1 |
| **合计** | | **57** |

## 阶段三最终测试结果

| 类别 | Suite 数 | 测试数 | 状态 |
|---|---|---|---|
| 单元测试 | 45 | 313 | ✅ |
| 集成测试 | 3 | XX | ✅ |

## 阶段三最终命令验证

```bash
make typecheck      # ✅
make lint           # ✅
make test-unit      # ✅
make test-integration # ✅ 3 个 suite
make build          # ✅
make build-registry # ✅ 6 个插件
make registry-check # ✅
```

---

**阶段三正式完成，里程碑 M3 达成。**

**下一步可选：**

1. **实机验证**：`make infra-up` + 启动 4 个服务，观察遥测落库（这是阶段三收尾的"实机"部分，代码交付已完成）。
2. **进入阶段四**：插件系统与前端外壳（gateway、前端外壳、dashboard、geofence/anomaly 接入 plugin-host）。

**请确认下一步方向。**