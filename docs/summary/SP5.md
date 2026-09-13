# ApisCloud - 蜂云 项目进度文档 SP5

> 本文档记录项目总目标、阶段规划、已完成部分、踩坑记录、文件清单。
> 重开对话时，读此文档即可继续干活。

---

# 第一部分：项目总目标与阶段规划

## 一、项目总目标

构建一套面向千万级智能驾驶车辆的服务调度系统，满足以下 13 条总目标：

| 编号 | 总目标 | 达成标准 |
|---|---|---|
| 1 | 系统可运行 | 500 辆模拟车辆实时调度，数据从采集到展示闭环 |
| 2 | 系统可扩展 | 新增功能只需新增插件，核心代码零改动 |
| 3 | 系统可维护 | 核心稳定冻结，插件自由迭代 |
| 4 | 系统可观测 | 监控、日志覆盖插件、服务、数据流 |
| 5 | 系统可测试 | 单元/集成/端到端三层测试覆盖 |
| 6 | 系统可文档化 | 每个功能一个文档，记录版本演进 |
| 7 | 系统可解耦 | 消息总线可切换，数据流不依赖单一媒介 |
| 8 | 系统可演进 | 从 500 辆模拟到千万级真实车辆，架构不推翻 |
| 9 | 调度可多维 | 支持多种调度算法，覆盖空间、服务等级等维度 |
| 10 | 插件可内嵌 | 插件支持进程内扩展，降低部署与运维复杂度 |
| 11 | 工程可自动化 | 具备 CI/CD 流水线，支持自动测试、自动构建 |
| 12 | 安全可内建 | 从认证、输入验证、密钥管理建立安全基础 |
| 13 | 压测可预留 | 当前不做压力测试，但预留监控、日志、配置可调能力 |

## 二、系统定位

本系统是**智能驾驶服务调度平台**，不是传统出租车调度，也不造自动驾驶系统，不控制车辆。

**核心定位：接入外部自动驾驶系统上报的数据，处理后做调度决策，下发指令给外部系统。**

| 维度 | 本系统 |
|---|---|
| 我们做 | 接入数据、处理数据、调度决策、下发指令 |
| 我们不做 | 不采集原始传感器数据、不控制车辆、不负责车辆安全 |
| 对接对象 | 外部自动驾驶系统 |
| 调度对象 | 智能驾驶车辆 |
| 车辆规模 | 千万级 |
| 服务类型 | 载客、巡检、物流、充电、维护、救援等 |
| 实时性 | 毫秒级到秒级 |
| 安全要求 | 极高（调度指令签名与校验） |

## 三、六阶段规划

### 阶段一：基础设施与共享库

**阶段目标：** 搭建所有服务共用的底层设施，确保后续开发有统一依赖。

**实现思路：**

- 用 Docker Compose 编排 Kafka、PostgreSQL、EMQX、Redis、Prometheus、Grafana、Loki。
- 编写共享库，封装 MQTT、PG、Redis、日志、配置、健康检查。
- 编写消息总线抽象层，支持 MQTT/Kafka/Memory 适配器。
- 编写层配置，先声明单层结构，预留多层。
- 编写插件宿主，支持进程内扩展。
- 建立 registry 目录，准备预生成机制。
- 建立 docs 和 tests 目录，规范落地。
- 建立 GitHub Actions 配置，支持自动测试、自动构建。
- 编写安全性基础：认证、输入验证、密钥管理。

**具体任务：**

| 序号 | 任务 | 怎么完成 | 产出 |
|---|---|---|---|
| 1.1 | 编写基础设施编排 | Docker Compose 定义所有基础设施 | docker-compose.infra.yml |
| 1.2 | 编写数据库初始化 | SQL 建表：车辆表、遥测表、告警表 | init.sql |
| 1.3 | 编写共享库 | 逐个封装：mqtt/pg/redis/logger/config/health | core/libs/ |
| 1.4 | 编写消息总线抽象层 | 统一接口 + MQTT/Kafka/Memory 适配器 | shared/message-bus/ |
| 1.5 | 编写层配置 | layers.yml 声明单层，预留多层 | shared/layer-config/layers.yml |
| 1.6 | 编写插件宿主 | 加载、注册、生命周期、异常保护 | core/plugin-host/ |
| 1.7 | 编写可观测性服务 | Prometheus + Loki | core/services/observability/ |
| 1.8 | 编写 CI 配置 | GitHub Actions | .github/workflows/ci.yml |
| 1.9 | 建立 registry | 创建目录和占位文件 | core/registry/ |
| 1.10 | 建立 docs | 创建目录和 README | docs/ |
| 1.11 | 建立 tests | 创建目录和配置 | tests/ |
| 1.12 | 编写安全基础 | 认证、输入验证、密钥管理 | security.V1.md |
| 1.13 | 编写文档 | 每个功能一个文档 | infra.V1.md 等 |

**阶段验收：** 基础设施可一键启动，共享库可被引用，消息总线可切换，层配置可加载，插件宿主可加载插件，可观测性可用，CI 可运行。

---

### 阶段二：核心数据流服务

**阶段目标：** 打通"数据进来 → 数据存下"的主干道。

**实现思路：**

- simulator 产生 500 辆模拟车辆数据，通过 MQTT 上报。
- ingest 作为唯一外部出入口，订阅遥测，转发到消息总线。
- data-writer 作为唯一写库者，从消息总线消费，写入 PostgreSQL 和 Redis。
- 定义主题：telemetry.raw、telemetry.agg、events.commands、events.alerts。
- 所有服务通过消息总线抽象层通信，不直接依赖 Kafka SDK。
- 服务与层分离，同一服务可在任意层部署。

**具体任务：**

| 序号 | 任务 | 怎么完成 | 产出 |
|---|---|---|---|
| 2.1 | 开发 simulator | 状态机 + GPS 生成器，500 辆模拟 | core/services/simulator/ |
| 2.2 | 开发 ingest | 订阅 MQTT，转发消息总线；订阅总线，下发 MQTT | core/services/ingest/ |
| 2.3 | 开发 data-writer | 消费消息总线，写 PG 和 Redis | core/services/data-writer/ |
| 2.4 | 定义消息总线主题 | 创建 4 个主题，设置分区和保留策略 | 主题配置 |
| 2.5 | 编写 simulator 测试 | 单元测试：状态机、车辆数量 | simulator.*.test.ts |
| 2.6 | 编写 ingest 测试 | 单元测试：MQTT 转总线、下行命令 | ingest.*.test.ts |
| 2.7 | 编写 data-writer 测试 | 单元测试：PG 插入、Upsert | dataWriter.*.test.ts |
| 2.8 | 编写消息总线测试 | 单元测试：各适配器、切换 | messageBus.*.test.ts |
| 2.9 | 编写集成测试 | MQTT → 消息总线 → PG 全链路 | integration.mqttToPg.test.ts |
| 2.10 | 编写功能文档 | 每个功能一个文档 | simulator.V1.md 等 |

**阶段验收：** 模拟器产生的数据能通过 MQTT → 消息总线 → PG 完整落库，消息总线可切换，集成测试通过。

---

### 阶段三：核心业务服务与调度算法

**阶段目标：** 实现智能驾驶服务调度的核心业务能力，融入多维度调度算法。

**实现思路：**

- dispatch-core 负责任务分发，调度算法以插件形式提供。
- 实现调度算法插件：最近邻、批量匹配、优先级调度。
- geofence 做地理围栏检测（插件）。
- anomaly 做阈值异常检测（插件）。
- 查询走 Redis 热路径，不直接从消息总线全量消费。
- 服务与层分离，同一服务可在任意层部署。

**具体任务：**

| 序号 | 任务 | 怎么完成 | 产出 |
|---|---|---|---|
| 3.1 | 开发 dispatch-core | 任务分发框架，算法插件接口 | core/services/dispatch-core/ |
| 3.2 | 开发 nearest-dispatch | 最近邻算法 | plugins/dispatch/nearest/ |
| 3.3 | 开发 batch-match | 批量匹配算法 | plugins/dispatch/batch-match/ |
| 3.4 | 开发 priority-dispatch | 优先级调度算法 | plugins/dispatch/priority-dispatch/ |
| 3.5 | 开发 geofence | zones.json 配置 + 圆形区域检测 | plugins/geofence/ |
| 3.6 | 开发 anomaly | 速度阈值 + 电量骤降检测 | plugins/anomaly/ |
| 3.7 | 编写调度算法测试 | 每个算法的单元测试 | dispatch.*.test.ts |
| 3.8 | 编写 geofence 测试 | 单元测试：围栏检测、边界 | geofence.zoneDetection.test.ts |
| 3.9 | 编写 anomaly 测试 | 单元测试：速度、电量阈值 | anomaly.speedThreshold.test.ts |
| 3.10 | 编写集成测试 | 调度流、告警流 | integration.dispatchFlow.test.ts |
| 3.11 | 编写功能文档 | 每个功能一个文档 | dispatchCore.V1.md 等 |

**阶段验收：** 车辆能收到派单指令，告警能正确产生并存储，调度算法可用，集成测试通过。

---

### 阶段四：插件系统与前端外壳

**阶段目标：** 建立进程内插件机制和前端宿主，让功能可插拔。

**实现思路：**

- plugin-host 负责进程内插件加载、注册、生命周期、异常保护。
- gateway 作为 HTTP 统一入口，动态注入插件路由。
- 前端外壳负责布局、路由、主题、UI 组件。
- 前端插件通过 ESM 动态 import 加载。
- 每一层都有自己的 gateway 和 plugin-host。
- 服务与层分离，同一服务可在任意层部署。

**具体任务：**

| 序号 | 任务 | 怎么完成 | 产出 |
|---|---|---|---|
| 4.1 | 开发 gateway | 路由注入 + 反向代理 | core/services/gateway/ |
| 4.2 | 开发 plugin-host | 加载、注册、生命周期、异常保护 | core/plugin-host/ |
| 4.3 | 编写 registry 生成脚本 | 扫描插件目录生成 registry.json | build-registry.js |
| 4.4 | 开发前端外壳 | 布局、侧边栏、顶栏、主题 | web/ |
| 4.5 | 开发前端插件加载器 | 动态 import、路由注册、导航生成 | plugin-loader.ts |
| 4.6 | 开发基础 UI 组件 | 按钮、卡片、表格等 | components/ui/ |
| 4.7 | 开发 dashboard | 地图、车辆、告警、统计页面 | plugins/dashboard/ |
| 4.8 | 编写 plugin-host 测试 | 加载、异常隔离 | pluginHost.*.test.ts |
| 4.9 | 编写层配置测试 | 加层、减层、层顺序 | layerConfig.addLayer.test.ts |
| 4.10 | 编写功能文档 | 每个功能一个文档 | gateway.V1.md 等 |

**阶段验收：** 前端可访问，基础仪表板可展示，插件可进程内加载，层配置可扩展。

---

### 阶段五：插件生态与性能优化

**阶段目标：** 验证插件化机制，解决功能增多后的性能问题。

**实现思路：**

- 新增若干示例插件验证即插即用。
- 实施消息总线性能方案：主题分层、选择性订阅、共享消费者组、Redis 热路径、批量消费、按车辆分区、插件懒订阅。
- 插件默认订阅聚合主题，不订阅原始主题。
- 插件默认从 Redis 读状态，不直接消费消息总线。
- 验证消息总线切换：Kafka → Memory，业务代码零改动。
- 验证层扩展：单层 → 多层，代码零改动。

**具体任务：**

| 序号 | 任务 | 怎么完成 | 产出 |
|---|---|---|---|
| 5.1 | 开发 charging-scheduler | 消费聚合遥测，检测低电量，发命令 | plugins/charging-scheduler/ |
| 5.2 | 开发 route-optimizer | 消费遥测，优化路线，发命令 | plugins/route-optimizer/ |
| 5.3 | 开发 reporting | 从 PG 读数据，生成报表 | plugins/reporting/ |
| 5.4 | 实施主题分层 | 创建 raw/aggregated/events 三层主题 | 主题配置 |
| 5.5 | 实施选择性订阅 | 插件 plugin.json 声明 filter | plugin.json 规范 |
| 5.6 | 实施共享消费者组 | 相似插件共享 groupId | 消费者组配置 |
| 5.7 | 实施 Redis 热路径 | 最新状态、空闲列表、区域统计 | Redis 结构 |
| 5.8 | 实施批量消费 | max.poll.records 调优 | 总线配置 |
| 5.9 | 实施按车辆分区 | 分区键为 vehicle_id | 主题分区配置 |
| 5.10 | 实施插件懒订阅 | plugin.json 声明 lazy | plugin.json 规范 |
| 5.11 | 验证消息总线切换 | Kafka → Memory | messageBus.switch.test.ts |
| 5.12 | 验证层扩展 | 单层 → 多层 | layerConfig.addLayer.test.ts |
| 5.13 | 编写插件测试 | 每个插件的单元测试 | tests/plugins/ |
| 5.14 | 编写性能测试 | 对比优化前后 | 性能报告 |
| 5.15 | 编写功能文档 | 每个插件一个文档 | plugins/*/V1.md |

**阶段验收：** 20+ 插件同时运行，消息总线不成为瓶颈，系统响应稳定，总线可切换，层可扩展。

---

### 阶段六：测试完善、部署与交付

**阶段目标：** 完善测试体系、部署流程，完成项目交付。

**实现思路：**

- 补全三层测试，确保覆盖率达标。
- 完善可观测性，覆盖插件、服务、数据流。
- 完善安全性：认证、输入验证、密钥管理。
- 编写部署脚本，支持按 profile 启动，支持按层组合部署。
- 编写部署文档，支持本地和云端。
- 完成端到端验证。
- 验证不同规模下的部署：单层、多层。

**具体任务：**

| 序号 | 任务 | 怎么完成 | 产出 |
|---|---|---|---|
| 6.1 | 补全单元测试 | 覆盖所有核心逻辑 | tests/*.test.ts |
| 6.2 | 补全集成测试 | 覆盖关键链路 | integration.*.test.ts |
| 6.3 | 补全端到端测试 | 覆盖完整数据流 | e2e.*.test.ts |
| 6.4 | 完善可观测性 | 覆盖插件、服务、数据流 | observability/ |
| 6.5 | 完善安全性 | 认证、输入验证、密钥管理 | security.V2.md |
| 6.6 | 编写启动脚本 | 按 profile 启动，按层组合启动 | start.sh |
| 6.7 | 编写测试脚本 | 按层级运行 | test.sh |
| 6.8 | 编写 Makefile | 一键命令 | Makefile |
| 6.9 | 编写部署文档 | 本地/云端部署指南 | docs/deployment.V1.md |
| 6.10 | 端到端验证 | 完整环境运行验证 | 验证报告 |
| 6.11 | 多规模验证 | 单层/多层部署验证 | 验证报告 |
| 6.12 | 编写交付文档 | 项目总结 | docs/README.md |

**阶段验收：** 测试覆盖率达标，可观测性完整，安全性达标，文档完整，多规模部署可复现。

---

### 项目里程碑

| 里程碑 | 阶段 | 产出 | 验收标准 |
|---|---|---|---|
| M1 | 阶段一 | 基础设施 + 共享库 + 消息总线抽象 + 层配置 + 插件宿主 + 可观测性 + CI 基础 + 安全基础 | 一键启动，总线可切换，层可配置，插件可加载，可观测性可用，CI 可运行 |
| M2 | 阶段二 | 数据流主干 | MQTT → 消息总线 → PG 完整落库，集成测试通过 |
| M3 | 阶段三 | 基础业务 + 调度算法 | 派单、告警正常，调度算法可用，集成测试通过 |
| M4 | 阶段四 | 插件系统 + 前端 | 仪表板可展示，插件可进程内加载，层可扩展 |
| M5 | 阶段五 | 插件生态 + 性能 | 20+ 插件稳定运行，总线可切换，层可扩展 |
| M6 | 阶段六 | 测试 + 可观测性 + 安全 + 部署 + 交付 | 覆盖率达标，可观测性完整，安全达标，多规模部署可复现 |

---

# 第二部分：已完成部分（阶段一、二、三、四、五）

## 阶段一：基础设施与共享库 ✅ 已完成

### 1.0 工程初始化

- 建 monorepo：`pnpm-workspace.yaml` 声明包路径。
- 统一 TS：`tsconfig.base.json` + 子包 `tsconfig.json`（project references 建 DAG）。
- 统一规范：ESLint 8、@typescript-eslint 8、Prettier 3。
- 统一测试：Jest 29 + ts-jest。
- 统一命令：Makefile。
- 环境变量：`.env.example` + `.env`。

### 1.1 + 1.2 基础设施编排 + 数据库初始化

- `docker-compose.infra.yml` 编排 7 个服务：PostgreSQL 16、Redis 7、EMQX 5.8、Kafka 3.7（KRaft）、Prometheus 2.54、Loki 3.1、Grafana 11.2。
- `deploy/postgres/init.sql` 建 4 张表 + 1 视图。
- 端口调整：EMQX `1883 → 11883`，Grafana `3000 → 13000`。
- 7 个 named volume，`infra-down` 保数据，`infra-reset` 删数据。

### 1.3 共享库 `core/libs`

8 个模块：config、logger、health、pg、redis、mqtt、metrics、security。

### 1.4 消息总线抽象层 `shared/message-bus`

- `topics.ts`：4 个主题常量。
- `envelope.ts`：统一消息信封，zod 校验。
- `interface.ts`：`MessageBus` 统一接口。
- 3 个适配器：MemoryAdapter、MqttAdapter、KafkaAdapter。
- `factory.ts`：按 `MESSAGE_BUS` 创建实例。

### 1.5 层配置 `shared/layer-config`

- `layers.yml`：单层 `single`，10 个核心服务。
- `schema.ts`：zod 校验，`KNOWN_SERVICES` 白名单。
- `loader.ts`：5 个查询函数。

### 1.6 插件宿主 `core/plugin-host`

- 8 个模块：types、schema、guard、loader、registry、lifecycle、host、index。
- `Plugin` 接口 6 个可选钩子。
- `PluginHost` 8 个公开方法。
- 模板插件 `plugins/_template/`。

### 1.7 可观测性服务 `core/services/observability`

- 9 个指标。
- 两个端点：`/metrics`、`/health`。
- `Tracer` 类为 OpenTelemetry 预留。

### 1.8 CI 配置 `.github/workflows/`

- `ci.yml`：5 个并行 job + 1 个汇总。
- `security.yml`：gitleaks + pnpm audit。
- `dependabot.yml`：3 个生态。

### 1.9 registry `scripts/`

- `scanner.js`、`validator.js`、`topo.js`、`profiles.js`、`build-registry.js`。

### 1.10-1.13 docs、tests、安全基础、文档

- docs：8 个功能文档。
- tests：扁平结构，命名规范。
- 安全：9 个子模块。

---

## 阶段二：核心数据流服务 ✅ 已完成

- simulator：500 辆车，MQTT 上报，状态机 + GPS。
- ingest：唯一外部出入口，双向转换。
- data-writer：唯一写库者，订阅 3 个主题。
- 4 个主题：telemetry.raw、telemetry.aggregated、events.commands、events.alerts。
- 集成测试：`integration.mqttToPg.test.ts`。
- 文档：simulator.V1、ingest.V1、dataWriter.V1、messageBus.V2、architecture.V2。

---

## 阶段三：核心业务服务与调度算法 ✅ 已完成

- dispatch-core：任务分发、硬约束过滤、目标函数、算法插件、签名。
- 3 个算法插件：nearest、batch-match、priority-dispatch。
- geofence、anomaly 插件（阶段三只写代码 + 测试）。
- data-writer 扩展：订阅 events.commands，写 dispatch_commands。
- 集成测试：`integration.dispatchFlow.test.ts`、`integration.alertFlow.test.ts`。
- 文档：dispatchCore.V1、nearestDispatch.V1、batchMatch.V1、priorityDispatch.V1、geofence.V1、anomaly.V1。

---

## 阶段四：插件系统与前端外壳 ✅ 已完成

- plugin-host 增强：`PluginContext` 注入 bus、createEnvelope、topics。
- geofence / anomaly 接入 plugin-host。
- gateway：HTTP 统一入口，3 种路由，内部创建 PluginHost，订阅插件主题。
- 前端外壳：Vite + React 18 + TS + Tailwind。
- UI 组件：7 个。
- dashboard 插件：4 个页面。
- 主题系统：CSS 变量 + dark 类。
- 测试：`gateway.router`、`gateway.config`、`gateway.pluginIntegration`。
- 文档：gateway.V1、pluginHost.V2、webShell.V1、dashboard.V1、layerConfig.V2。

---

## 阶段五：插件生态与性能优化 ✅ 已完成

### 5.0 根配置改动

- `tsconfig.base.json` 加 `@apiscloud/aggregator` paths。
- 根 `tsconfig.json` 加 aggregator reference。
- `jest.config.js` 加 aggregator 映射和覆盖率。
- `.env.example` 加 aggregator 配置、gateway 消费者组说明。
- `prometheus.yml` 加 aggregator target。

### 5.1 aggregator 核心服务

**怎么完成：**

- 12 个文件：types、config、window、aggregator、mapper、service、index、server-entry。
- `AggregationWindow` 类：Map 累积最新车辆状态。
- `aggregate()` 纯函数：计算 avg_speed、avg_battery、low_battery_vehicles、idle_vehicles。
- 订阅 `telemetry.raw`，每 5 秒 flush 一次，发 `telemetry.aggregated`。
- 消费者组 `apiscloud-aggregator`。
- 端口 9108。

**关键设计：**

- aggregator 是核心服务，不是插件。
- 时间窗用 `Map` + `setInterval`，同车只保留最新。
- 聚合输出扩展 `low_battery_vehicles` 和 `idle_vehicles`。

### 5.2 charging-scheduler 插件

**怎么完成：**

- `plugin.json`：订阅 `telemetry.aggregated`，发布 `events.commands`。
- `detectors.js`：纯逻辑，含 `selectChargingCandidates`、`buildChargeCommand`、`pruneRecentCommands`。
- `index.js`：插件入口，从 ctx 拿依赖。
- 2 个测试。

**关键设计：**

- 输入来自 aggregated 的 `low_battery_vehicles`。
- 幂等 + 冷却：5 分钟内不重复。
- 冷却记录 `recentCommands: Map<vehicle_id, timestamp>`。

### 5.3 route-optimizer 插件 + filter 机制

**怎么完成：**

- `schema.ts` 加 `TopicFilterSchema`。
- `types.ts` 加 `TopicFilter`。
- `host.ts` 的 `dispatchMessage` 应用 filter。
- `plugin.json`：filter `{field: 'status', equals: 'running'}`。
- `optimizer.js` + `index.js`。
- 3 个测试。

**关键设计：**

- 双层过滤：plugin-host 层拦截非 running；插件内部判断 `speed < 15`。
- filter 支持 `equals` 和 `in`，field 支持点分路径。

### 5.4 reporting 插件 + data-writer 查询端点

**怎么完成：**

- data-writer 加 HTTP 服务器（不启动 observability 的）。
- `query.ts` 4 个查询函数。
- `server.ts` 提供 `/health`、`/metrics`、`/api/query/*`。
- `service.ts` 加 `port()`。
- plugin-host 加 `HttpClient` 和 `ServiceUrls`。
- `PluginContext` 加 `http`、`services`。
- `PluginHostOptions` 加 `services`，`buildContext` 注入。
- `plugins/reporting/` 3 个文件。
- 3 个测试。

**关键设计：**

- 不破坏"只有 data-writer 连库"：插件通过 `ctx.http` 调 data-writer 查询端点。
- `ctx.services`：服务 URL 清单，从环境变量计算。

### 5.5 性能优化

**怎么完成：**

- `topics.ts` 加分层语义注释。
- `PluginHost` 加 `activated` 集合、`activatePlugin`、`isActivated`、`getSubscribedTopics`。
- `dispatchMessage` 跳过未激活插件。
- gateway 用 `getSubscribedTopics()`。
- 2 个测试。

**关键设计：**

- 懒订阅决策：`lazy: false` 始终激活；`lazy: true` 且有订阅主题激活；`lazy: true` 且无订阅主题不激活。
- dashboard 不占消费者名额。

### 5.6 验证 + 文档

**怎么完成：**

- `messageBus.switchVerification.test.ts`：总线切换验证。
- `layerConfig.multiLayer.test.ts`：多层配置验证。
- `integration.pluginEcosystem.test.ts`：完整插件生态链路。
- 8 个文档。

### 阶段五额外完成的修复（实机验证时暴露）

- Kafka 消费组无限 rebalance → 复合 groupId。
- 测试脚本 timestamp 超长 → `now_ms` 辅助函数。
- Prometheus `--config.expand-env` 不支持 → 端口写死。
- Docker Desktop for Linux `host.docker.internal` 指向 VM → `${HOST_IP:-host-gateway}`。
- 前端电量、速度显示 "—" → SQL `::float8` + 前端 `toNum`。
- dashboard 4 个页面占位 → 真实数据接入。

---

## 还没完成的部分

| 阶段 | 状态 | 未完成内容 |
|---|---|---|
| 阶段一 | ✅ 已完成 | 无 |
| 阶段二 | ✅ 已完成 | 无 |
| 阶段三 | ✅ 已完成 | 无 |
| 阶段四 | ✅ 已完成 | 无 |
| 阶段五 | ✅ 已完成 | 无 |
| 阶段六 | ⬜ 未开始 | 测试完善、可观测性完善、安全完善、部署、交付 |

**阶段五遗留的可选增强（非必需）：**

- 批量消费（`eachBatch` 实现）
- 真实压测（5000 / 10 万规模）
- dispatch-core HTTP 端点（让 `submitTask` 可外部调用）
- ACK 机制（simulator 消费 MQTT 命令回 ACK）

---

# 第三部分：阶段五踩过的坑

## 坑 1：Kafka 消费组无限 rebalance

**问题：**

- data-writer 和 gateway 日志刷屏 `The group is rebalancing`
- 手动发 `events.alerts` 消息，PG 无数据
- `kafka-consumer-groups.sh --describe` 显示 LAG 持续增大

**原因：**

data-writer 用**同一个 groupId** `apiscloud-data-writer` 订阅了 4 个主题。kafkajs 每次 `subscribe` 创建一个独立 consumer，共用同一个 groupId。**Kafka 规定同一 groupId 的所有 member 必须订阅相同的 topic 集合**，否则无限 rebalance。

**MemoryAdapter 不区分 groupId，所以测试全绿，实机才暴露。**

**解决：**

改 `shared/message-bus/adapters/kafka.ts`，用复合 groupId：

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

**影响文件：** `shared/message-bus/adapters/kafka.ts`。

---

## 坑 2：测试脚本 timestamp 超长

**问题：**

```
[kafka-adapter] 消息处理失败 topic=telemetry.raw: 
  信封校验失败：timestamp:Too big: expected int to be <=9007199254740991
```

**原因：**

`test-alerts.sh` 里 `date +%s%3N`，某些 shell 下输出 19 位纳秒时间戳，超过 JS `MAX_SAFE_INTEGER`（16 位），被 zod 拒绝。

**解决：**

```bash
now_ms() {
  echo "$(($(date +%s) * 1000))"
}
```

用 `date +%s`（10 位秒）乘 1000 得到 13 位毫秒，兼容所有环境。

**影响文件：** `scripts/test-alerts.sh`。

---

## 坑 3：Prometheus `--config.expand-env` 不支持

**问题：**

```
Error parsing command line arguments: unknown long flag '--config.expand-env'
```

**原因：**

`--config.expand-env` 是 Prometheus 3.x 的 flag，当前用 2.54，不支持。

**解决：**

- 去掉 `--config.expand-env` 和 `environment`。
- `prometheus.yml` 的端口改为字面量。
- HOST_IP 用 `${HOST_IP:-host-gateway}` 处理。

**影响文件：** `docker-compose.infra.yml`、`monitor/prometheus/prometheus.yml`。

---

## 坑 4：Docker Desktop for Linux 的 `host.docker.internal` 指向 VM

**问题：**

```
dial tcp 192.168.65.254:9101: connect: connection refused
```

`192.168.65.254` 是 Docker Desktop VM 的网段，`host.docker.internal` 指向 VM 而非 Ubuntu 宿主机。

**解决：**

- `docker-compose.infra.yml` 的 `extra_hosts` 用 `${HOST_IP:-host-gateway}`。
- `scripts/dev-up.sh` 自动检测宿主机 IP 并 `export HOST_IP`。
- 用户可手动 `export HOST_IP=$(hostname -I | awk '{print $1}')`。

**影响文件：** `docker-compose.infra.yml`、`scripts/dev-up.sh`。

---

## 坑 5：`dataWriter.query.test.ts` 参数类型错误

**问题：**

```
error TS7006: Parameter 'rows' implicitly has an 'any' type.
```

**解决：** Mock 接口显式声明 `setResponse: (rows: unknown[]) => void`。

**影响文件：** `tests/dataWriter.query.test.ts`。

---

## 坑 6：`reporting.plugin.test.ts` 的 body 类型 unknown

**问题：**

```
error TS18046: 'body.vehicles' is of type 'unknown'.
```

**解决：** 定义 `SummaryBody`、`VehiclesBody`、`AlertsBody` 接口，用 `as unknown as XxxBody` 断言。

**影响文件：** `tests/reporting.plugin.test.ts`。

---

## 坑 7：`dataWriter.handlers.test.ts` 缺 queryLimit

**问题：**

```
TS2741: Property 'queryLimit' is missing in type '{...}' but required in type 'DataWriterConfig'
```

**解决：** 测试的 config 加 `queryLimit: 100`。

**影响文件：** `tests/dataWriter.handlers.test.ts`。

---

## 坑 8：电量、速度显示 "—"

**问题：** 前端车辆页的 battery、speed 列显示 `—`。

**原因：** PG 的 `NUMERIC` 字段被 node-postgres 解析为**字符串**（避免精度丢失），前端 `typeof row.battery === 'number'` 判断失败。

**解决：**

1. **后端 SQL 加 `::float8`**：`battery::float8 AS battery`、`speed::float8 AS speed`、`heading::float8 AS heading`。
2. **前端加 `toNum` 辅助函数**：兼容数字、字符串、null。
3. `VehicleRow` 类型字段改为 `number | string | null`。

**影响文件：** `core/services/data-writer/src/query.ts`、`web/src/api/client.ts`、`web/src/plugins/dashboard/pages/Vehicles.tsx`、`web/src/plugins/dashboard/pages/Overview.tsx`。

---

## 坑 9：告警/指令显示"阶段五接入后显示"

**问题：** dashboard 4 个页面是静态占位文字。

**原因：** 阶段四的占位页面没更新为真实 API 调用。阶段五做了后端查询端点，但没接前端。

**解决：** 重写 4 个页面：

- `Overview.tsx`：调 3 个查询组合统计。
- `Vehicles.tsx`：调 `fetchActiveVehicles`。
- `Alerts.tsx`：调 `fetchRecentAlerts`。
- `Commands.tsx`：调 `fetchRecentCommands`。

**影响文件：** `web/src/plugins/dashboard/pages/` 4 个页面。

---

# 第四部分：阶段五创建的文件清单

## 根配置改动

| 文件 | 改动 |
|---|---|
| `tsconfig.base.json` | 加 2 条 `@apiscloud/aggregator` paths |
| `tsconfig.json`（根） | 加 aggregator reference |
| `jest.config.js` | 加 aggregator 映射和覆盖率 |
| `.env.example` | 加 aggregator 配置、gateway 消费者组、HOST_IP 说明 |
| `.env` | 同步 |
| `monitor/prometheus/prometheus.yml` | 加 aggregator target，端口改字面量 |
| `docker-compose.infra.yml` | Prometheus 去 expand-env，`extra_hosts` 用 `${HOST_IP:-host-gateway}` |
| `shared/message-bus/adapters/kafka.ts` | 复合 groupId |
| `shared/message-bus/topics.ts` | 加分层语义注释 |

## `core/services/aggregator/` — 聚合器（阶段五）

```
core/services/aggregator/
├── package.json
├── tsconfig.json
├── plugin.json
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts
    ├── config.ts
    ├── window.ts
    ├── aggregator.ts
    ├── mapper.ts
    └── service.ts
```

| 文件 | 功能 |
|---|---|
| `types.ts` | `TelemetryRawPayload`、`AggregatedPayload`、`AggregatorConfig` |
| `config.ts` | `loadAggregatorConfig`，7 个环境变量 |
| `window.ts` | `AggregationWindow` 类，Map 累积 |
| `aggregator.ts` | `aggregate()` 纯函数 |
| `mapper.ts` | `extractTelemetryRaw`、`aggregatedToEnvelope` |
| `service.ts` | 组合，订阅 `telemetry.raw`，定时 flush |
| `index.ts` | 统一出口 |
| `server-entry.ts` | 独立启动 |

## `core/services/data-writer/` 阶段五改动

| 文件 | 改动 |
|---|---|
| `src/types.ts` | 加 `VehicleQueryRow`、`AlertQueryRow`、`CommandQueryRow`、`queryLimit` |
| `src/config.ts` | 加 `queryLimit` |
| `src/query.ts` | 新建，4 个查询函数，SQL 用 `::float8` |
| `src/server.ts` | 新建，HTTP 服务器 |
| `src/service.ts` | 启动自己的 HTTP 服务器，加 `port()` |
| `src/index.ts` | 加查询和服务器导出 |

## `core/plugin-host/` 阶段五改动

| 文件 | 改动 |
|---|---|
| `src/schema.ts` | 加 `TopicFilterSchema` |
| `src/types.ts` | 加 `TopicFilter`、`HttpClient`、`ServiceUrls`，`PluginContext` 加 `http`、`services` |
| `src/http-client.ts` | 新建，HTTP 客户端 |
| `src/host.ts` | 加 `activated` 集合、`activatePlugin`、`isActivated`、`getSubscribedTopics`；`buildContext` 注入 `http`、`services`；`dispatchMessage` 应用 filter 和 activated 检查 |
| `src/index.ts` | 加 `HttpClient`、`ServiceUrls`、`TopicFilter` 导出 |

## `plugins/charging-scheduler/` — 充电调度插件（阶段五）

```
plugins/charging-scheduler/
├── plugin.json
└── src/
    ├── detectors.js
    └── index.js
```

| 文件 | 功能 |
|---|---|
| `plugin.json` | 订阅 `telemetry.aggregated` |
| `detectors.js` | 纯逻辑：候选过滤、指令构建、冷却清理 |
| `index.js` | 插件入口 |

## `plugins/route-optimizer/` — 路线优化插件（阶段五）

```
plugins/route-optimizer/
├── plugin.json
└── src/
    ├── optimizer.js
    └── index.js
```

| 文件 | 功能 |
|---|---|
| `plugin.json` | 订阅 `telemetry.raw`，filter `status=running` |
| `optimizer.js` | 纯逻辑：低速检测、指令构建、冷却清理 |
| `index.js` | 插件入口 |

## `plugins/reporting/` — 报表插件（阶段五）

```
plugins/reporting/
├── plugin.json
└── src/
    ├── reports.js
    └── index.js
```

| 文件 | 功能 |
|---|---|
| `plugin.json` | 声明 3 个路由 |
| `reports.js` | 纯逻辑：车辆、告警、命令汇总 |
| `index.js` | 插件入口，通过 `ctx.http` 调 data-writer |

## `web/src/plugins/dashboard/pages/` 阶段五改动

| 文件 | 改动 |
|---|---|
| `Overview.tsx` | 重写，调 3 个查询组合统计 |
| `Vehicles.tsx` | 重写，调 `fetchActiveVehicles`，加 `toNum` |
| `Alerts.tsx` | 重写，调 `fetchRecentAlerts` |
| `Commands.tsx` | 重写，调 `fetchRecentCommands` |

## `web/src/api/client.ts` 阶段五改动

- 加 `proxyGet` 辅助函数。
- 加 `VehicleRow`、`AlertRow`、`CommandRow` 类型（字段兼容 number | string | null）。
- 加 `fetchActiveVehicles`、`fetchRecentAlerts`、`fetchRecentCommands`。

## `tests/` 阶段五新增

```
tests/
├── aggregator.window.test.ts
├── aggregator.aggregator.test.ts
├── chargingScheduler.detectors.test.ts
├── chargingScheduler.plugin.test.ts
├── pluginHost.filter.test.ts
├── routeOptimizer.optimizer.test.ts
├── routeOptimizer.plugin.test.ts
├── dataWriter.query.test.ts
├── reporting.reports.test.ts
├── reporting.plugin.test.ts
├── pluginHost.lazySubscription.test.ts
├── messageBus.partition.test.ts
├── messageBus.switchVerification.test.ts
├── layerConfig.multiLayer.test.ts
└── integration.pluginEcosystem.test.ts
```

## `docs/` 阶段五新增

```
docs/
├── aggregator.V1.md
├── chargingScheduler.V1.md
├── routeOptimizer.V1.md
├── reporting.V1.md
├── messageBus.V3.md
├── layerConfig.V3.md
├── busPerformance.V1.md
└── README.md （更新）
```

## `scripts/` 阶段五新增

```
scripts/
├── dev-up.sh
├── dev-down.sh
├── dev-status.sh
├── test-alerts.sh
└── test-commands.sh
```

## `.env.example` 阶段五新增

```dotenv
# ========== Aggregator ==========
AGGREGATOR_PORT=9108
AGGREGATOR_WINDOW_MS=5000
AGGREGATOR_CONSUMER_GROUP=apiscloud-aggregator
AGGREGATOR_LOW_BATTERY_THRESHOLD=20
AGGREGATOR_REGION=global
AGGREGATOR_REGION_CENTER_LAT=31.2304
AGGREGATOR_REGION_CENTER_LNG=121.4737

# ========== 插件性能 ==========
GATEWAY_PLUGIN_CONSUMER_GROUP=apiscloud-gateway
DATA_WRITER_QUERY_LIMIT=100

# ========== 宿主机 IP（可选） ==========
# 大多数环境不需要设置，Docker 会自动解析 host.docker.internal。
# 只有 Docker Desktop for Linux 旧版需要手动指定：
#   export HOST_IP=$(hostname -I | awk '{print $1}')
# HOST_IP=
```

## `monitor/prometheus/prometheus.yml` 阶段五改动

- 加 aggregator target（9108）。
- 删掉 plugin-host（9102）和 observability（9106），它们是库。
- 端口改字面量（9090、9101、9103、9104、9105、9107、9108）。

## `docker-compose.infra.yml` 阶段五改动

- Prometheus 去掉 `--config.expand-env` 和 `environment`。
- Prometheus 和 Grafana 的 `extra_hosts` 用 `${HOST_IP:-host-gateway}`。

---

# 第五部分：阶段五额外完成的内容

阶段五在**实机验证**过程中，额外修复了 **9 个坑**，这些不在 destination.md 阶段五任务列表里，但**是系统真正跑起来必须解决的**。

## 额外内容 1：Kafka 消费组复合 groupId

**为什么做：** 实机验证时发现 data-writer 和 gateway 无限 rebalance，PG 无数据。

**怎么完成：** 改 `shared/message-bus/adapters/kafka.ts`，用 `buildGroupId(baseGroupId, topic)` 生成复合 groupId。

**改动文件：** `shared/message-bus/adapters/kafka.ts`。

## 额外内容 2：测试脚本时间戳修复

**为什么做：** 测试脚本发消息被 zod 拒绝，`timestamp` 超长。

**怎么完成：** `now_ms()` 用 `$(($(date +%s) * 1000))` 生成 13 位毫秒。

**改动文件：** `scripts/test-alerts.sh`、`scripts/test-commands.sh`。

## 额外内容 3：Prometheus 兼容修复

**为什么做：** `--config.expand-env` 在 Prometheus 2.54 不支持，容器启动失败。

**怎么完成：** 去掉 expand-env，端口写死，HOST_IP 用 `${HOST_IP:-host-gateway}`。

**改动文件：** `docker-compose.infra.yml`、`monitor/prometheus/prometheus.yml`。

## 额外内容 4：Docker Desktop for Linux 兼容

**为什么做：** `host.docker.internal` 指向 VM 而非宿主机，Prometheus 抓不到服务。

**怎么完成：** `extra_hosts` 用 `${HOST_IP:-host-gateway}`，`dev-up.sh` 自动检测宿主机 IP。

**改动文件：** `docker-compose.infra.yml`、`scripts/dev-up.sh`。

## 额外内容 5：SQL `::float8` 类型修复

**为什么做：** 前端车辆页电量、速度列显示 "—"。

**怎么完成：** PG 的 `NUMERIC` 字段被 node-postgres 解析为字符串，SQL 加 `::float8` 转数字。

**改动文件：** `core/services/data-writer/src/query.ts`。

## 额外内容 6：前端 `toNum` 兼容

**为什么做：** 同额外内容 5，前端防御性编程。

**怎么完成：** 加 `toNum` 函数，兼容数字、字符串、null。

**改动文件：** `web/src/plugins/dashboard/pages/Vehicles.tsx`、`Overview.tsx`、`web/src/api/client.ts`。

## 额外内容 7：Dashboard 4 个页面真实数据接入

**为什么做：** 阶段四留下的占位页显示"阶段五接入后显示"，用户看不到真实数据。

**怎么完成：** 重写 4 个页面，通过 gateway 反向代理调 data-writer 查询端点。

**改动文件：** `web/src/plugins/dashboard/pages/Overview.tsx`、`Vehicles.tsx`、`Alerts.tsx`、`Commands.tsx`。

## 额外内容 8：一键启动/停止/状态脚本

**为什么做：** 手动起 6 个服务太麻烦。

**怎么完成：** 写 3 个脚本：

- `dev-up.sh`：基础设施 + 构建 + 6 个服务 + 前端。
- `dev-down.sh`：停止所有服务。
- `dev-status.sh`：查看服务状态。

**改动文件：** `scripts/dev-up.sh`、`dev-down.sh`、`dev-status.sh`。

## 额外内容 9：告警/指令测试脚本

**为什么做：** 验证告警和指令链路。

**怎么完成：** 写 2 个脚本：

- `test-alerts.sh`：触发 geofence_exit、speed_anomaly、battery_drop。
- `test-commands.sh`：触发 route-optimizer、charging-scheduler。

**改动文件：** `scripts/test-alerts.sh`、`scripts/test-commands.sh`。

## 额外完成的核心价值

**这 9 个额外内容让系统从"集成测试全绿"升级为"实机跑通"。** 用户打开 `http://localhost:5173` 能看到真实的车辆列表、告警列表、指令列表。

**实机验证证据：** 前端 dashboard 指令页显示 65 条 charge 指令，说明：

- aggregator 每 5 秒聚合一次
- charging-scheduler 正确识别低电量车辆
- 冷却机制生效
- data-writer 正确写 PG
- 前端正确展示

**全链路：**

```
simulator → MQTT → EMQX → ingest → telemetry.raw
                                       │
                                       ├─→ data-writer → PG/Redis
                                       ├─→ dispatch-core → events.commands
                                       ├─→ aggregator → telemetry.aggregated
                                       │                  │
                                       │                  └─→ charging-scheduler → events.commands
                                       └─→ gateway → geofence/anomaly/route-optimizer → events.commands
                                                                                          │
                                                                                          ├─→ ingest → MQTT commands/*
                                                                                          └─→ data-writer → PG dispatch_commands
                                                                                                             │
                                                                                                             └─→ gateway → 前端 dashboard
```

---

# 第六部分：当前状态与下一步

## 当前命令验证

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

## 当前服务端口分配

| 服务 | 端口 | 状态 |
|---|---|---|
| gateway | 9101 | ✅ |
| plugin-host | 9102 | 库 |
| ingest | 9103 | ✅ |
| data-writer | 9104 | ✅ |
| dispatch-core | 9105 | ✅ |
| observability | 9106 | 库 |
| simulator | 9107 | ✅ |
| aggregator | 9108 | ✅ |

## 当前插件清单（10 个）

| 插件 | 订阅主题 | 说明 |
|---|---|---|
| nearest | — | 最近邻算法 |
| batch-match | — | 批量匹配 |
| priority-dispatch | — | 优先级调度 |
| geofence | telemetry.raw | 地理围栏 |
| anomaly | telemetry.raw | 异常检测 |
| dashboard | — | 仪表板（前端） |
| charging-scheduler | telemetry.aggregated | 充电调度 |
| route-optimizer | telemetry.raw（filter） | 路线优化 |
| reporting | —（HTTP 路由） | 报表 |
| example-plugin | — | 示例 |

## 当前消息主题（4 个）

| 主题 | 生产者 | 消费者 |
|---|---|---|
| telemetry.raw | ingest | data-writer、dispatch-core、aggregator、gateway |
| telemetry.aggregated | aggregator | data-writer、gateway |
| events.commands | dispatch-core、charging-scheduler、route-optimizer | ingest、data-writer |
| events.alerts | geofence、anomaly | data-writer |

## 启动流程

```bash
# 一键启动
./scripts/dev-up.sh

# 或手动
make infra-up
make init-topics
make build
node core/services/aggregator/dist/server-entry.js &
node core/services/data-writer/dist/server-entry.js &
node core/services/dispatch-core/dist/server-entry.js &
node core/services/ingest/dist/server-entry.js &
node core/services/simulator/dist/server-entry.js &
node core/services/gateway/dist/server-entry.js &
cd web && pnpm dev
```

## 下一步：阶段六

**阶段目标：** 完善测试体系、部署流程，完成项目交付。

**要做的：**

| 序号 | 任务 | 产出 |
|---|---|---|
| 6.1 | 补全单元测试 | tests/*.test.ts |
| 6.2 | 补全集成测试 | integration.*.test.ts |
| 6.3 | 补全端到端测试 | e2e.*.test.ts |
| 6.4 | 完善可观测性 | observability/ |
| 6.5 | 完善安全性 | security.V2.md |
| 6.6 | 编写启动脚本 | start.sh |
| 6.7 | 编写测试脚本 | test.sh |
| 6.8 | 编写 Makefile | Makefile |
| 6.9 | 编写部署文档 | docs/deployment.V1.md |
| 6.10 | 端到端验证 | 验证报告 |
| 6.11 | 多规模验证 | 验证报告 |
| 6.12 | 编写交付文档 | docs/README.md |

**阶段六开工前必须看的关键代码：**

1. `shared/message-bus/adapters/kafka.ts`：复合 groupId（阶段五修复）。
2. `core/services/aggregator/src/service.ts`：聚合器组合模式。
3. `core/services/data-writer/src/query.ts`：查询端点（阶段五新增）。
4. `core/plugin-host/src/host.ts`：PluginHost 完整实现。
5. `tests/integration.pluginEcosystem.test.ts`：生态集成测试模板。
6. `scripts/dev-up.sh`：一键启动脚本。

**阶段六关键决策：**

1. **端到端测试**：用真实基础设施（Docker Compose）+ 真实服务，跑完整链路。
2. **多规模验证**：用 `SIMULATOR_VEHICLE_COUNT` 环境变量调规模（500 / 5000 / 10000）。
3. **部署脚本**：支持 `make start PROFILE=core/full`。
4. **安全完善**：JWT + 限流 + 指令签名 + 输入验证。

---

# 第七部分：重开对话时的最小上下文

如果重开对话，只需提供以下信息即可继续：

1. **本文档**（SP5.md，描述项目全局和已完成部分）。
2. **当前任务的代码**（如阶段六的端到端测试）。
3. **如果涉及现有模块**：对应的接口文件。

我就能接着往下干。

**重开对话时的标准问法：**

> 这是 SP5.md，项目阶段一、二、三、四、五已完成，现在进入阶段六。请阅读 SP5.md，然后从阶段六的 [具体任务] 开始，逐文件输出。

**如果继续阶段六，第一批建议从这些文件开始：**

1. `tests/e2e.fullPipeline.test.ts`：端到端测试。
2. `tests/e2e.frontendApi.test.ts`：前端 API 测试。
3. `scripts/start.sh`：按 profile 启动脚本。
4. `scripts/test.sh`：分层测试脚本。
5. `docs/deployment.V1.md`：部署文档。

---

**文档版本：** SP5
**对应阶段：** 阶段一、二、三、四、五完成，阶段六未开始
**最后更新：** 阶段五完成时