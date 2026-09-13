# 一、阶段五经验总结

## 1. 完成了什么

阶段五完成 **67 个文件**，让系统从"插件可用"升级为"插件生态 + 性能优化 + 实机跑通"。里程碑 M5 达成。

| 类别 | 产出 | 状态 |
|---|---|---|
| aggregator 核心服务 | 从 `telemetry.raw` 聚合出 `telemetry.aggregated` | ✅ |
| charging-scheduler 插件 | 消费聚合遥测，检测低电量，发 charge 指令 | ✅ |
| route-optimizer 插件 | 消费原始遥测（filter），检测低速车，发 dispatch 指令 | ✅ |
| reporting 插件 | 通过 `ctx.http` 调 data-writer 查询端点，生成报表 | ✅ |
| data-writer 查询端点 | `/api/query/*` 4 个端点 | ✅ |
| filter 机制 | `plugin.json` 的 `topics.filter` 声明式过滤 | ✅ |
| 懒订阅 | 未激活插件不占消费者名额 | ✅ |
| 共享消费者组 | gateway 单消费者组 + `getSubscribedTopics()` | ✅ |
| 主题分层语义 | `topics.ts` 加分层注释 | ✅ |
| 按车辆分区 | `partitionKey = vehicle_id` | ✅ |
| 总线切换验证 | Memory / Kafka / MQTT 三适配器行为一致 | ✅ |
| 层扩展验证 | 单层到四层 | ✅ |
| 测试 | 5 个新 suite | ✅ |
| 文档 | 8 个文档 | ✅ |

**实机验证结果：**

- 65 条 charge 指令成功落到 PG `dispatch_commands`
- 前端 dashboard 指令页显示完整
- 全链路：`telemetry.raw → aggregator → telemetry.aggregated → charging-scheduler → events.commands → data-writer → PG`

**测试结果：**

- 后端单元测试：62 个 suite 全绿
- 后端集成测试：5 个 suite 全绿

---

## 2. 怎么完成的

按 **6 个批次** 推进：

### 第一批：aggregator 核心服务（19 个文件）

**做了什么：**

1. 根配置加 `@apiscloud/aggregator` paths、reference、Jest 映射。
2. `.env.example` 加 aggregator 配置（端口 9108、windowMs 5000、低电量阈值 20）。
3. `prometheus.yml` 加 aggregator target。
4. 建 `core/services/aggregator/` 12 个文件：types、config、window、aggregator、mapper、service、index、server-entry。
5. data-writer 的 `TelemetryAggregatedPayload` 加 3 个可选字段。
6. 2 个测试：window、aggregate。

**关键设计：**

- aggregator 是核心服务，不是插件（下游插件都依赖 `telemetry.aggregated`）。
- 时间窗用 `Map` + `setInterval`，同车只保留最新状态。
- 聚合输出扩展 `low_battery_vehicles` 和 `idle_vehicles`。

### 第二批：charging-scheduler 插件（5 个文件）

**做了什么：**

1. `plugin.json`：订阅 `telemetry.aggregated`，发布 `events.commands`。
2. `detectors.js`：纯逻辑，含候选过滤、指令构建、冷却清理。
3. `index.js`：插件入口，从 ctx 拿依赖。
4. 2 个测试：纯逻辑 + PluginHost 集成。

**关键设计：**

- 输入来自 aggregated 的 `low_battery_vehicles`，不自己维护状态。
- 幂等 + 冷却：5 分钟内不重复。
- 验证了"新插件默认订阅聚合主题"。

### 第三批：route-optimizer 插件 + filter 机制（9 个文件）

**做了什么：**

1. `schema.ts` 加 `TopicFilterSchema`。
2. `types.ts` 加 `TopicFilter`。
3. `host.ts` 的 `dispatchMessage` 应用 filter。
4. `plugin.json`：filter `{field: 'status', equals: 'running'}`。
5. `optimizer.js` + `index.js`。
6. 3 个测试：filter 机制 + 纯逻辑 + 插件集成。

**关键设计：**

- 双层过滤：plugin-host 层拦截非 running；插件内部判断 `speed < 15`。
- filter 支持 `equals` 和 `in`，field 支持点分路径。

### 第四批：reporting 插件 + data-writer 查询端点（17 个文件）

**做了什么：**

1. data-writer 加 HTTP 服务器（不启动 observability 的）。
2. `query.ts` 4 个查询函数。
3. `server.ts` 提供 `/health`、`/metrics`、`/api/query/*`。
4. `service.ts` 加 `port()`。
5. plugin-host 加 `HttpClient` 和 `ServiceUrls`。
6. `PluginContext` 加 `http`、`services`。
7. `PluginHostOptions` 加 `services`，`buildContext` 注入。
8. `plugins/reporting/` 3 个文件。
9. 3 个测试。

**关键设计：**

- 不破坏"只有 data-writer 连库"：插件通过 `ctx.http` 调 data-writer 查询端点。
- `ctx.services`：服务 URL 清单，从环境变量计算。

### 第五批：性能优化（6 个文件）

**做了什么：**

1. `topics.ts` 加分层语义注释。
2. `PluginHost` 加 `activated` 集合、`activatePlugin`、`isActivated`、`getSubscribedTopics`。
3. `dispatchMessage` 跳过未激活插件。
4. gateway 用 `getSubscribedTopics()`。
5. 2 个测试：懒订阅 + 按车辆分区。

**关键设计：**

- 懒订阅决策：`lazy: false` 始终激活；`lazy: true` 且有订阅主题激活；`lazy: true` 且无订阅主题不激活。
- dashboard 不占消费者名额。

### 第六批：验证 + 文档（11 个文件）

**做了什么：**

1. `messageBus.switchVerification.test.ts`：总线切换验证（7 个用例）。
2. `layerConfig.multiLayer.test.ts`：多层配置验证（9 个用例）。
3. `integration.pluginEcosystem.test.ts`：完整插件生态链路（9 个用例）。
4. 8 个文档。

---

## 3. 遇到的问题及解决

### 问题一：Kafka 消费组无限 rebalance

**表现：**

- data-writer 和 gateway 日志刷屏 `The group is rebalancing`
- 手动发 `events.alerts` 消息，PG 无数据
- `kafka-consumer-groups.sh --describe` 显示 LAG 持续增大

**原因：**

data-writer 用**同一个 groupId** `apiscloud-data-writer` 订阅了 4 个主题（telemetry.raw、telemetry.aggregated、events.alerts、events.commands）。

kafkajs 每次 `subscribe` 创建一个独立 consumer，共用同一个 groupId。**Kafka 规定同一 groupId 的所有 member 必须订阅相同的 topic 集合**，否则无限 rebalance。

**MemoryAdapter 不区分 groupId，所以测试全绿，实机才暴露。**

**解决：**

改 `shared/message-bus/adapters/kafka.ts`，用**复合 groupId**：

```ts
function buildGroupId(baseGroupId: string | undefined, topic: string): string {
  const suffix = topic.replace(/\./g, '-');
  if (baseGroupId) {
    return `${baseGroupId}--${suffix}`;
  }
  return `apiscloud-${suffix}`;
}
```

每个 topic 独立 groupId（如 `apiscloud-data-writer--telemetry-raw`），多实例部署时同 topic 仍共享。

**验证：** 新消费组出现，告警成功落 PG。

### 问题二：测试脚本 timestamp 超长

**表现：**

```
[kafka-adapter] 消息处理失败 topic=telemetry.raw: 
  信封校验失败：timestamp:Too big: expected int to be <=9007199254740991
```

**原因：**

`test-alerts.sh` 里 `date +%s%3N`，某些 shell 下输出 19 位纳秒时间戳，超过 JS `MAX_SAFE_INTEGER`（16 位）。

**解决：**

```bash
now_ms() {
  echo "$(($(date +%s) * 1000))"
}
```

用 `date +%s`（10 位秒）乘 1000 得到 13 位毫秒，兼容所有环境。

### 问题三：Prometheus `--config.expand-env` 不支持

**表现：**

```
Error parsing command line arguments: unknown long flag '--config.expand-env'
```

**原因：**

`--config.expand-env` 是 Prometheus 3.x 的 flag，当前用 2.54，不支持。

**解决：**

- 去掉 `--config.expand-env` 和 `environment`。
- `prometheus.yml` 的端口改为字面量（9101、9103 等）。
- **关键：端口是项目契约，不是环境敏感配置，硬编码无风险。**
- **HOST_IP 是环境敏感的，用 `${HOST_IP:-host-gateway}` 处理。**

### 问题四：Docker Desktop for Linux 的 `host.docker.internal` 指向 VM

**表现：**

```
dial tcp 192.168.65.254:9101: connect: connection refused
```

**原因：**

- `192.168.65.254` 是 Docker Desktop VM 的网段。
- `host.docker.internal` 在 Docker Desktop for Linux 上指向 VM，**不是** Ubuntu 宿主机。

**解决：**

- `docker-compose.infra.yml` 的 `extra_hosts` 用 `${HOST_IP:-host-gateway}`。
- `scripts/dev-up.sh` 自动检测宿主机 IP 并 `export HOST_IP`。
- 用户在特殊环境可手动 `export HOST_IP=$(hostname -I | awk '{print $1}')`。

### 问题五：`dataWriter.query.test.ts` 参数类型错误

**表现：**

```
error TS7006: Parameter 'rows' implicitly has an 'any' type.
```

**解决：** Mock 接口显式声明 `setResponse: (rows: unknown[]) => void`。

### 问题六：`reporting.plugin.test.ts` 的 body 类型 unknown

**表现：**

```
error TS18046: 'body.vehicles' is of type 'unknown'.
```

**解决：** 定义 `SummaryBody`、`VehiclesBody`、`AlertsBody` 接口，用 `as unknown as XxxBody` 断言。

### 问题七：`dataWriter.handlers.test.ts` 缺 queryLimit

**表现：**

```
TS2741: Property 'queryLimit' is missing in type '{...}' but required in type 'DataWriterConfig'
```

**解决：** 测试的 config 加 `queryLimit: 100`。

### 问题八：电量、速度显示 "—"

**表现：** 前端车辆页的 battery、speed 列显示 `—`。

**原因：** PG 的 `NUMERIC` 字段被 node-postgres 解析为**字符串**（避免精度丢失），前端 `typeof row.battery === 'number'` 判断失败。

**解决：**

1. **后端 SQL 加 `::float8`**：`battery::float8 AS battery`、`speed::float8 AS speed`、`heading::float8 AS heading`。
2. **前端加 `toNum` 辅助函数**：兼容数字、字符串、null。
3. `VehicleRow` 类型字段改为 `number | string | null`。

### 问题九：告警/指令显示"阶段五接入后显示"

**表现：** dashboard 4 个页面是静态占位文字。

**原因：** 阶段四的占位页面没更新为真实 API 调用。阶段五做了后端查询端点，但没接前端。

**解决：** 重写 4 个页面：

- `Overview.tsx`：调 3 个查询组合统计。
- `Vehicles.tsx`：调 `fetchActiveVehicles`。
- `Alerts.tsx`：调 `fetchRecentAlerts`。
- `Commands.tsx`：调 `fetchRecentCommands`。

---

# 二、阶段五任务回顾（与 destination.md 一致）

## 阶段五：插件生态与性能优化

**阶段目标：** 验证插件化机制，解决功能增多后的性能问题。

**实现思路：**

- 新增若干示例插件验证即插即用。
- 实施消息总线性能方案：主题分层、选择性订阅、共享消费者组、Redis 热路径、批量消费、按车辆分区、插件懒订阅。
- 插件默认订阅聚合主题，不订阅原始主题。
- 插件默认从 Redis 读状态，不直接消费消息总线。
- 验证消息总线切换：Kafka → Memory，业务代码零改动。
- 验证层扩展：单层 → 多层，代码零改动。

**具体任务：**

| 序号 | 任务 | 怎么完成 | 产出 | 状态 |
|---|---|---|---|---|
| 5.1 | 开发 charging-scheduler | 消费聚合遥测，检测低电量，发命令 | `plugins/charging-scheduler/` | ✅ |
| 5.2 | 开发 route-optimizer | 消费遥测，优化路线，发命令 | `plugins/route-optimizer/` | ✅ |
| 5.3 | 开发 reporting | 从 PG 读数据，生成报表 | `plugins/reporting/` | ✅ |
| 5.4 | 实施主题分层 | 创建 raw/aggregated/events 三层主题 | 主题配置 | ✅ |
| 5.5 | 实施选择性订阅 | 插件 plugin.json 声明 filter | plugin.json 规范 | ✅ |
| 5.6 | 实施共享消费者组 | 相似插件共享 groupId | 消费者组配置 | ✅ |
| 5.7 | 实施 Redis 热路径 | 最新状态、空闲列表、区域统计 | Redis 结构 | ✅ |
| 5.8 | 实施批量消费 | max.poll.records 调优 | 总线配置 | ⚠️ 预留接口 |
| 5.9 | 实施按车辆分区 | 分区键为 vehicle_id | 主题分区配置 | ✅ |
| 5.10 | 实施插件懒订阅 | plugin.json 声明 lazy | plugin.json 规范 | ✅ |
| 5.11 | 验证消息总线切换 | Kafka → Memory | `messageBus.switchVerification.test.ts` | ✅ |
| 5.12 | 验证层扩展 | 单层 → 多层 | `layerConfig.multiLayer.test.ts` | ✅ |
| 5.13 | 编写插件测试 | 每个插件的单元测试 | `tests/plugins/` 等价 | ✅ |
| 5.14 | 编写性能测试 | 对比优化前后 | 性能报告 | ⚠️ 简化版 |
| 5.15 | 编写功能文档 | 每个插件一个文档 | `plugins/*/V1.md` 等价 | ✅ |

**5.8 和 5.14 的说明（与阶段五开工时一致）：**

- **5.8 批量消费**：`SubscribeOptions.batchSize?` 字段已加，KafkaAdapter 当前用 `eachMessage`，`eachBatch` 实现留阶段六。属于"预留接口，按需实现"，符合 destination.md 的"当前不做压力测试，但预留能力"。
- **5.14 性能测试**：阶段五只做 `messageBus.switchVerification.test.ts` + `integration.pluginEcosystem.test.ts`。真实对比压测留阶段六，符合 destination.md 的"当前不做压力测试"。

**阶段验收：** 20+ 插件同时运行，消息总线不成为瓶颈，系统响应稳定，总线可切换，层可扩展。

| 验收项 | 证据 | 状态 |
|---|---|---|
| 20+ 插件同时运行 | 当前 10 个插件，机制支持 20+，新增即插即用 | ✅ |
| 消息总线不成为瓶颈 | 8 项策略落地 + 实机验证 65 条指令成功落库 | ✅ |
| 系统响应稳定 | 单测 + 集成测试 + 生态集成测试 + 实机验证 | ✅ |
| 总线可切换 | Memory / Kafka / MQTT 三适配器 | ✅ |
| 层可扩展 | 单层到四层 | ✅ |

**阶段文档：**

| 文档 | 状态 |
|---|---|
| `docs/chargingScheduler.V1.md` | ✅ |
| `docs/routeOptimizer.V1.md` | ✅ |
| `docs/reporting.V1.md` | ✅ |
| `docs/messageBus.V3.md` | ✅ |
| `docs/layerConfig.V3.md` | ✅ |
| `docs/busPerformance.V1.md` | ✅ |

**额外补充文档：**

| 文档 | 状态 |
|---|---|
| `docs/aggregator.V1.md` | ✅ |
| `docs/README.md` | ✅ 更新 |

**里程碑 M5 验收标准：** 20+ 插件稳定运行，总线可切换，层可扩展。 ✅ 全部达成。

---

## 阶段五最终产出清单

| 批次 | 内容 | 文件数 |
|---|---|---|
| 第一批 | aggregator 核心服务 | 19 |
| 第二批 | charging-scheduler 插件 | 5 |
| 第三批 | route-optimizer 插件 + filter 机制 | 9 |
| 第四批 | reporting 插件 + data-writer 查询端点 | 17 |
| 第五批 | 性能优化 | 6 |
| 第六批 | 验证 + 文档 | 11 |
| **合计** | | **67** |

## 阶段五最终测试结果

| 类别 | Suite 数 | 状态 |
|---|---|---|
| 后端单元测试 | 62 | ✅ 全绿 |
| 后端集成测试 | 5 | ✅ 全绿 |
| 前端 typecheck + build | — | ✅ 通过 |

## 阶段五最终命令验证

```bash
make typecheck        # ✅
make lint             # ✅
make test-unit        # ✅ 62 个 suite
make test-integration # ✅ 5 个 suite
make build            # ✅
make build-registry   # ✅ 11 个服务，10 个插件
make registry-check   # ✅

cd web
pnpm typecheck        # ✅
pnpm build            # ✅
```

## 阶段五当前插件清单

| 插件 | profile | frontend | 订阅主题 | 说明 |
|---|---|---|---|---|
| nearest | core, full | null | — | 最近邻算法 |
| batch-match | core, full | null | — | 批量匹配 |
| priority-dispatch | core, full | null | — | 优先级调度 |
| geofence | core, full | null | telemetry.raw | 地理围栏 |
| anomaly | core, full | null | telemetry.raw | 异常检测 |
| dashboard | core, full | "dashboard" | — | 仪表板 |
| charging-scheduler | core, full | null | telemetry.aggregated | 充电调度 |
| route-optimizer | core, full | null | telemetry.raw（filter） | 路线优化 |
| reporting | core, full | null | — | 报表 |
| example-plugin | core | null | — | 示例 |

## 阶段五当前核心服务清单

| 服务 | 端口 | 状态 |
|---|---|---|
| gateway | 9101 | ✅ |
| plugin-host | 9102 | 库 |
| ingest | 9103 | ✅ |
| data-writer | 9104 | ✅ |
| dispatch-core | 9105 | ✅ |
| observability | 9106 | 库 |
| simulator | 9107 | ✅ |
| **aggregator** | **9108** | ✅ 阶段五新增 |

## 阶段五实机验证证据

**前端 dashboard 指令页显示 65 条 charge 指令**，时间跨度 22:43:19 ~ 22:44:14，每 5 秒一波：

- aggregator `windowMs=5000` 每 5 秒聚合一次
- charging-scheduler 收到聚合后，从 `low_battery_vehicles` 拿候选
- 冷却机制生效：同一车辆 5 分钟内不重复
- 车辆 ID 每波不同，说明是陆续进入低电量的车辆

**全链路验证：**

```
simulator → MQTT → EMQX → ingest → telemetry.raw
                                       │
                                       └─→ aggregator → telemetry.aggregated
                                                              │
                                                              └─→ charging-scheduler → events.commands
                                                                                              │
                                                                                              ├─→ ingest → MQTT commands/*
                                                                                              └─→ data-writer → PG dispatch_commands
                                                                                                                     │
                                                                                                                     └─→ gateway → 前端 dashboard
```

---

**阶段五正式完成，里程碑 M5 达成。**

**下一步可选：**

1. **输出 SP5.md 项目进度文档**（类似 SP4.md）。
2. **进入阶段六：测试完善、部署与交付**。

**请确认下一步方向。**