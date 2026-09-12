# 一、阶段 2.1 经验总结

## 1. 完成了什么

阶段 2.1 完成了 **simulator 服务的完整实现 + 单元测试 + 文档**，让 500 辆模拟车能通过 MQTT 实时上报状态。

| 类别 | 产出 | 状态 |
|---|---|---|
| 包配置 | `core/services/simulator/package.json`、`tsconfig.json` | ✅ |
| 类型定义 | `src/types.ts`：`VehicleState`、`VehicleStatus`、`SimulatorConfig`、`GeoPoint` | ✅ |
| 配置加载 | `src/config.ts`：`loadSimulatorConfig`，8 个环境变量 | ✅ |
| GPS 计算 | `src/gps-generator.ts`：`randomPointInRadius`、`distanceKm`、`moveTowards`、`bearing` | ✅ |
| 状态机 | `src/state-machine.ts`：`nextState`、`nextBattery`，纯函数 | ✅ |
| 单车模型 | `src/vehicle.ts`：`Vehicle` 类，封装 tick 逻辑 | ✅ |
| 车队管理 | `src/fleet.ts`：`Fleet` 类，批量管理 | ✅ |
| MQTT 发布 | `src/mqtt-publisher.ts`：`createMqttPublisher` | ✅ |
| 服务组合 | `src/service.ts`：`createSimulatorService`，组合车队 + 发布器 + 可观测性 | ✅ |
| 统一出口 | `src/index.ts` | ✅ |
| 启动入口 | `src/server-entry.ts`，支持 SIGTERM/SIGINT | ✅ |
| 单元测试 | 5 个测试文件，63 个测试全绿 | ✅ |
| 文档 | `docs/simulator.V1.md` | ✅ |
| 实机验证 | 500 辆车，25 秒发 12500 条，mosquitto_sub 收到消息 | ✅ |
| 可观测性 | `/metrics`、`/health` 正常 | ✅ |

**核心成果**：
- 500 辆车，1 秒间隔，稳定上报 `telemetry/raw`。
- 状态机覆盖 idle/running/charging/maintenance/offline 五种状态。
- GPS 轨迹在上海周边 30km 内，速度 20-60 km/h，电量真实变化。
- 单元测试 63 个，覆盖纯函数、单车、车队、配置。

## 2. 怎么完成的

**第一步：建包骨架。**
先建 `package.json` 和 `tsconfig.json`，让 pnpm workspace 和 `tsc -b` 识别新包。`references` 指向 `core/libs` 和 `observability`。

**第二步：自底向上写代码。**
按依赖顺序：
1. `types.ts` — 类型定义，无依赖。
2. `gps-generator.ts` — 纯函数，无依赖。
3. `state-machine.ts` — 纯函数，无依赖。
4. `config.ts` — 依赖 `types` 和 `libs`。
5. `vehicle.ts` — 依赖 `gps-generator`、`state-machine`、`types`。
6. `fleet.ts` — 依赖 `vehicle`。
7. `mqtt-publisher.ts` — 依赖 `libs`。
8. `service.ts` — 组合以上所有 + `observability`。
9. `index.ts` — 统一出口。
10. `server-entry.ts` — 启动入口。

**第三步：设计关键决策。**
- **simulator 不引 message-bus**：因为它只走 MQTT，不碰总线。
- **MQTT topic 统一为 `telemetry/raw`**：与总线 `telemetry.raw` 一一对应，ingest 映射简单。
- **`VehicleState` 字段与 `init.sql` 对齐**：data-writer 直接映射，不用再转换。
- **状态机和 GPS 用纯函数**：方便单测，无副作用。
- **`tickSec` 由调用方传**：与 publish 间隔绑定，不硬编码。
- **`Promise.all` 并行发布**：500 辆车同时发，不串行等待。
- **每辆车独立 catch**：一辆失败不影响其他。

**第四步：写测试。**
5 个测试文件，纯函数用精确断言，有随机性的用范围断言：
- `stateMachine`：覆盖 5 状态 × 迁移分支。
- `gpsGenerator`：用已知地理距离（上海到北京 1067km，1 度纬度 111km）验证。
- `vehicle`：初始化、tick、1000 次长期运行。
- `fleet`：500 辆规模、ID 格式、唯一性。
- `config`：默认值、环境变量覆盖、非法值抛错。

**第五步：实机验证。**
- `make infra-up` 起 EMQX。
- `node dist/server-entry.js` 起 simulator。
- `curl /metrics` 看指标。
- `mosquitto_sub -t 'telemetry/raw'` 收消息。
- 验证 500 辆车、25 秒 12500 条。

**第六步：写文档。**
按 `docs/README.md` 模板，写 `simulator.V1.md`，记录功能目标、基础实现、V1 修改、后续版本。

## 3. 遇到了什么问题

### 问题一：`make registry-check` 报 `Unterminated quoted string`

**现象：**
```
make registry-check
node scripts/build-registry.js
[registry] 已生成 core/registry/registry.json：10 个服务，1 个插件
/bin/sh: 1: Syntax error: Unterminated quoted string
make: *** [Makefile:105: registry-check] Error 2
```

**原因：**
Makefile 里的 `registry-check` 目标用了多行 `node -e "..."`：
```makefile
registry-check: build-registry
	@node -e "
	  const r = require('./core/registry/registry.json');
	  ...
	"
```
Makefile 把每个 tab 缩进行当作独立命令，第一行 `node -e "` 字符串没闭合，shell 报错。

**解决：**
抽出独立脚本 `scripts/check-registry.js`，Makefile 只调一行：
```makefile
registry-check: build-registry
	node scripts/check-registry.js
```

**教训：**
Makefile 里不要写多行 `node -e`。复杂逻辑抽到独立脚本，Makefile 只做编排。

### 问题二：`gps-generator.ts` 报 TS2349 "此表达式不可调用"

**现象：**
```
core/services/simulator/src/gps-generator.ts:45:17
error 2349: 此表达式不可调用。类型 "Number" 没有调用签名。
```

**原因：**
`moveTowards` 的参数名 `distanceKm` 和同文件的函数 `distanceKm` 重名，参数遮蔽了函数：
```ts
export function moveTowards(from: GeoPoint, to: GeoPoint, distanceKm: number): GeoPoint {
  const total = distanceKm(from, to);  // distanceKm 是 number，不是函数
```

**解决：**
把参数名改成 `stepKm`：
```ts
export function moveTowards(from: GeoPoint, to: GeoPoint, stepKm: number): GeoPoint {
  const total = distanceKm(from, to);
  if (total <= stepKm || total === 0) {
    return { ...to };
  }
  const ratio = stepKm / total;
```

**教训：**
函数名和参数名不要重名。命名规则：函数用动词开头，参数用名词。

### 问题三：`/health` 输出看起来乱码

**现象：**
```
{"status":"ok","service":"simulator",","uptimeSec":36,"checks":{"self":{"starvice running","latencyMs":1},"mqtt":{{"status":"ok","message":"500 vehicles
```

**原因：**
不是乱码，是终端把长 JSON 单行输出做了字符覆盖（curl 进度条 + 终端换行冲突）。实际 JSON 是完整的。

**解决：**
用 `curl -s http://localhost:9107/health | jq` 或重定向到文件查看。

**教训：**
curl 长 JSON 输出加 `-s` 关进度条，用 `jq` 格式化。

### 问题四：`emqx ctl topics list` 返回 No topics

**现象：**
```
docker exec -it apiscloud-emqx /opt/emqx/bin/emqx ctl topics list
No topics.
```

**原因：**
EMQX 5.x 的 `topics list` 列的是**订阅关系**，不是所有消息 topic。simulator 只发布不订阅，所以为空。这不是 bug。

**解决：**
用 `mosquitto_sub` 订阅验证真实收到消息：
```bash
docker run --rm --network host eclipse-mosquitto \
  mosquitto_sub -h localhost -p 11883 -t 'telemetry/raw' -v -C 5
```
收到 5 条 JSON 消息，证明 simulator 确实在发 MQTT。

**教训：**
验证 MQTT 发布，要用订阅者验证，不能只看 broker 的订阅列表。

## 4. 关键经验

1. **自底向上写代码**：纯函数 → 组合模块 → 服务 → 入口，每层依赖明确。
2. **纯函数优先**：状态机、GPS 计算都是纯函数，单测容易，无副作用。
3. **类型与 DB 表对齐**：`VehicleState` 字段和 `init.sql` 对齐，减少后续映射成本。
4. **配置全部可调**：8 个环境变量，阶段五压测直接用。
5. **每辆车独立 catch**：批量发布时单点失败不影响整体。
6. **测试有随机性用范围断言**：位置、电量、航向都断言范围，不断言精确值。
7. **已知地理距离做锚点**：上海到北京 1067km，1 度纬度 111km，验证 GPS 公式正确。
8. **Makefile 不要写多行 node -e**：抽独立脚本。
9. **函数名和参数名不重名**：避免遮蔽。
10. **实机验证要看订阅者**：`mosquitto_sub` 比 `emqx ctl topics list` 更可靠。

---

# 二、阶段二任务回顾

## 阶段二总体目标

**打通"模拟车 MQTT 上报 → ingest 转发到总线 → data-writer 落 PG/Redis"的主干道。**

## 数据流

```
simulator ──MQTT──→ EMQX ──订阅──→ ingest ──发布──→ 消息总线(telemetry.raw)
                                                          │
                                                          │ 订阅
                                                          ▼
                                                   data-writer
                                                          │
                                          ┌───────────────┼───────────────┐
                                          ▼               ▼               ▼
                                     vehicle_latest  vehicle_telemetry  alerts
                                       (PG UPSERT)      (PG INSERT)    (PG INSERT)
                                          │
                                          ▼
                                       Redis 热路径
```

## 核心规则

1. **只有 Ingest 连外部（MQTT）**，simulator 通过 MQTT 上报，不直接写总线。
2. **只有 Data-Writer 连库（PG/Redis）**。
3. **服务之间零直接调用**，只通过消息总线。
4. **所有服务用 `@apiscloud/libs` 和 `@apiscloud/message-bus`**，不直接引 SDK。
5. **核心服务独立启动**，不走 plugin-host，参照 `observability/server-entry.ts`。
6. **每个服务都暴露 `/metrics` 和 `/health`**，用 `createObservabilityService`。

## 三个服务的定位

| 服务 | 角色 | 输入 | 输出 |
|---|---|---|---|
| simulator | 外部系统替身 | 内部状态机 | MQTT 上报 `telemetry/raw` |
| ingest | 唯一外部出入口 | MQTT 订阅 | 总线 `telemetry.raw`；总线订阅 → MQTT 下行 |
| data-writer | 唯一写库者 | 总线 `telemetry.raw`、`telemetry.aggregated`、`events.alerts` | PG + Redis |

## 阶段二任务清单

| 序号 | 任务 | 产出 | 状态 |
|---|---|---|---|
| 2.0 | 根配置改动 | `tsconfig.base.json`、`tsconfig.json`、`jest.config.js`、`.env`、`.env.example`、`prometheus.yml` | ✅ |
| 2.1 | 开发 simulator | `core/services/simulator/` 完整实现 | ✅ |
| 2.2 | 开发 ingest | `core/services/ingest/` 完整实现 | ⬜ |
| 2.3 | 开发 data-writer | `core/services/data-writer/` 完整实现 | ⬜ |
| 2.4 | 主题确认 | 用 `TOPICS` 常量，不硬编码 | ⬜ |
| 2.5 | simulator 测试 | `tests/simulator.*.test.ts` | ✅ |
| 2.6 | ingest 测试 | `tests/ingest.*.test.ts` | ⬜ |
| 2.7 | data-writer 测试 | `tests/dataWriter.*.test.ts` | ⬜ |
| 2.8 | 集成测试 | `tests/integration.mqttToPg.test.ts` | ⬜ |
| 2.9 | 文档 | `docs/simulator.V1.md`、`docs/ingest.V1.md`、`docs/dataWriter.V1.md`、`docs/messageBus.V2.md` | ⬜（simulator 部分 ✅） |

## destination.md 里的阶段二任务

| 序号 | 任务 | 怎么完成 | 产出 | 状态 |
|---|---|---|---|---|
| 2.1 | 开发 simulator | 状态机 + GPS 生成器，500 辆模拟 | `core/services/simulator/` | ✅ |
| 2.2 | 开发 ingest | 订阅 MQTT，转发消息总线；订阅总线，下发 MQTT | `core/services/ingest/` | ⬜ |
| 2.3 | 开发 data-writer | 消费消息总线，写 PG 和 Redis | `core/services/data-writer/` | ⬜ |
| 2.4 | 定义消息总线主题 | 创建 4 个主题，设置分区和保留策略 | 主题配置 | ⬜ |
| 2.5 | 编写 simulator 测试 | 单元测试：状态机、车辆数量 | `simulator.stateMachine.test.ts` | ✅ |
| 2.6 | 编写 ingest 测试 | 单元测试：MQTT 转总线、下行命令 | `ingest.mqttToBus.test.ts` | ⬜ |
| 2.7 | 编写 data-writer 测试 | 单元测试：PG 插入、Upsert | `dataWriter.pgInsert.test.ts` | ⬜ |
| 2.8 | 编写消息总线测试 | 单元测试：各适配器、切换 | `messageBus.*.test.ts` | ⬜ |
| 2.9 | 编写集成测试 | MQTT → 消息总线 → PG 全链路 | `integration.mqttToPg.test.ts` | ⬜ |
| 2.10 | 编写功能文档 | 每个功能一个文档 | `simulator.V1.md` 等 | ⬜（simulator ✅） |

## 阶段二验收标准

| 项 | 标准 | 状态 |
|---|---|---|
| 类型检查 | `make typecheck` 通过 | ✅ |
| Lint | `make lint` 通过 | ✅ |
| 单元测试 | `make test-unit` 通过 | ✅（simulator 部分） |
| 构建 | `make build` 通过 | ✅ |
| Registry | `make registry-check` 通过 | ✅ |
| 数据流 | simulator 发 MQTT → ingest 转总线 → data-writer 写 PG/Redis | ⬜（simulator 侧 ✅） |
| 可观测 | 三个服务 `/metrics`、`/health` 可访问 | ⬜（simulator ✅） |
| 总线可切换 | `MESSAGE_BUS=memory` 和 `MESSAGE_BUS=mqtt` 都能跑 | ⬜ |
| 文档 | 四篇 V1 文档就位 | ⬜（simulator ✅） |

## 阶段二阶段文档

| 文档 | 状态 |
|---|---|
| `docs/simulator.V1.md` | ✅ |
| `docs/ingest.V1.md` | ⬜ |
| `docs/dataWriter.V1.md` | ⬜ |
| `docs/messageBus.V2.md` | ⬜ |

---

# 三、下一步

阶段 2.1 完成，进入 **阶段 2.2：开发 ingest**。

阶段 2.2 要创建这些文件：

```
core/services/ingest/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts
    ├── config.ts
    ├── mqtt-subscriber.ts
    ├── mqtt-publisher.ts
    ├── bus-publisher.ts
    ├── bus-subscriber.ts
    ├── validation.ts
    ├── mapper.ts
    └── service.ts
```

**ingest 与 simulator 的关键差异**：
- simulator 只发 MQTT，ingest 既订阅 MQTT 又发布总线。
- ingest 要引入 `@apiscloud/message-bus`。
- ingest 要做输入校验（用 `@apiscloud/libs` 的 schema）。
- ingest 要做双向转换：MQTT payload ↔ Envelope payload。

**请确认：是否从阶段 2.2 的 `package.json` 和 `tsconfig.json` 开始，逐文件输出？**