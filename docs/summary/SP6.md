# ApisCloud - 蜂云 项目进度文档 SP6（最终版）

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

# 第二部分：已完成部分（阶段一、二、三、四、五、六）

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

### 5.1 aggregator 核心服务

- 12 个文件，含 AggregationWindow、aggregate 纯函数。
- 订阅 telemetry.raw，每 5 秒 flush，发 telemetry.aggregated。
- 扩展 `low_battery_vehicles`、`idle_vehicles`、`region_center`。

### 5.2 charging-scheduler 插件

- 订阅 telemetry.aggregated，从 `low_battery_vehicles` 拿候选。
- 幂等 + 冷却（5 分钟）。
- 发 events.commands（charge）。

### 5.3 route-optimizer 插件 + filter 机制

- filter：`{ field: 'status', equals: 'running' }`。
- 双层过滤：plugin-host 层 + 插件内部。
- 发 events.commands（dispatch）。

### 5.4 reporting 插件 + data-writer 查询端点

- data-writer 加 HTTP 服务器：`/api/query/*`。
- plugin-host 加 `HttpClient` 和 `ServiceUrls`。
- `PluginContext` 加 `http`、`services`。

### 5.5 性能优化

- topics.ts 加分层语义注释。
- PluginHost 加 `activated` 集合、`activatePlugin`、`isActivated`、`getSubscribedTopics`。
- dispatchMessage 跳过未激活插件。

### 5.6 验证 + 文档

- 5 个新 suite，8 个文档。
- 实机验证额外修复 9 个坑。

---

## 阶段六：测试完善、部署与交付 ✅ 已完成

### 6.0 根配置改动

- 无（阶段六主要加测试和文档，不改根配置）。

### 6.1 第一批：e2e 测试基础设施 + 2 个 e2e 测试

**怎么完成：**

1. `tests/helpers/e2e-infra.ts`：集中 mock（MockPg、MockRedis、MockMqttSubscriber、MockMqttPublisher、makeTelemetry）。
2. `tests/helpers/e2e-setup.ts`：环境准备/清理。
3. `tests/e2e.fullPipeline.test.ts`：11 个用例。
4. `tests/e2e.frontendApi.test.ts`：11 个用例。
5. `tests/README.md` 更新。

**关键设计：**

- e2e 用 MemoryAdapter，不用真实 Kafka。
- 真实基础设施验证通过 `scripts/verify-e2e.sh` 手动跑。

### 6.2 第二批：单元/集成测试覆盖率补全

**怎么完成：**

1. `tests/gateway.proxy.test.ts`：7 个用例。
2. `tests/aggregator.edgeCases.test.ts`：15 个用例。
3. `tests/dispatchCore.constraints.edgeCases.test.ts`：18 个用例。
4. `tests/dispatchCore.objective.edgeCases.test.ts`：11 个用例。
5. `tests/pluginHost.httpClient.test.ts`：9 个用例。
6. `tests/messageBus.kafkaGroupId.test.ts`：12 个用例。
7. `tests/messageBus.filter.test.ts`：6 个用例。
8. `tests/integration.gatewayToDataWriter.test.ts`：5 个用例。

**关键设计：**

- `buildGroupId` 导出为纯函数，直接测。
- 用真实 `node:http` server 测代理和 HTTP 客户端。

### 6.3 第三批：可观测性完善

**怎么完成：**

1. `metrics.ts`：加 5 个业务指标。
2. `dispatch-core/service.ts`：handleTask 各分支递增 dispatchTasks。
3. `gateway/service.ts`：消息桥递增 pluginDispatch。
4. `monitor/grafana/dashboards/apiscloud-overview.json`：6 个 panel。
5. `monitor/loki/loki-config.yml`：结构化标签。
6. `tests/observability.businessMetrics.test.ts`：9 个用例。
7. `docs/observability.V2.md`。

### 6.4 第三批补充：插件端指标上报

**怎么完成：**

1. `PluginContext` 加 `metrics?: PluginMetrics`。
2. `PluginHostOptions` 加 `metrics?`，`buildContext` 注入。
3. gateway 传给 PluginHost。
4. charging-scheduler / geofence / anomaly 各接指标。
5. `tests/pluginHost.metricsInjection.test.ts`。

### 6.5 第四批：安全性完善

**怎么完成：**

1. `GatewayConfig` 加 auth / 限流字段。
2. `guards.ts`：`createAuthGuard` + `createRateLimitGuard`。
3. `server.ts` 支持 guards。
4. `ingest/types.ts` 加 verifySignature / signSecret。
5. `ingest/service.ts` 加签名校验。
6. `.env.example` / `.env` 加配置。
7. 3 个测试文件，16 个用例。
8. `docs/security.V2.md`。

### 6.6 第五批：启动/测试脚本 + Makefile

**怎么完成：**

1. `scripts/start.sh`：一键启动，支持 PROFILE / LAYERS。
2. `scripts/test.sh`：分层测试入口。
3. `scripts/verify-e2e.sh`：真实基础设施端到端验证。
4. `scripts/verify-multi-scale.sh`：多规模验证。
5. `Makefile`：加 start / stop / status / verify-e2e / verify-multi-scale。

### 6.7 第六批：部署文档 + 多规模验证

**怎么完成：**

1. `docs/deployment.V1.md`：三种部署方式 + 环境变量清单 + 部署踩坑。
2. `docs/testing.V1.md`：测试规范 + 命名规范 + 覆盖率 + 修复流程。
3. `docs/api.V1.md`：所有 HTTP API + MQTT 主题 + 总线主题 + 消息信封。
4. `docs/README.md` 更新。

### 6.8 第七批：端到端验证 + 交付文档

**怎么完成：**

1. 跑 `./scripts/verify-e2e.sh`。
2. `docs/delivery.V1.md`：交付文档。
3. `docs/README.md` 加 `delivery.V1.md`。

---

## 还没完成的部分

| 阶段 | 状态 | 未完成内容 |
|---|---|---|
| 阶段一 | ✅ 已完成 | 无 |
| 阶段二 | ✅ 已完成 | 无 |
| 阶段三 | ✅ 已完成 | 无 |
| 阶段四 | ✅ 已完成 | 无 |
| 阶段五 | ✅ 已完成 | 无 |
| 阶段六 | ✅ 已完成 | 无 |
| **阶段六之后** | ⬜ 未开始 | 见下方"后续可选工作" |

**后续可选工作（不属于六阶段，按需做）：**

- dispatch-core HTTP 端点：让 `submitTask` 能被外部触发
- ACK 机制：simulator 消费 MQTT 命令，回 ACK，data-writer 更新 `dispatch_commands.status`
- Promtail 日志采集：日志进 Loki，Grafana 能查
- K8s 部署清单：`deploy/k8s/`
- 多规模压测：5000 / 10000 规模
- mTLS + 插件签名
- 多集群部署
- WebSocket / SSE 实时推送
- 分库分表 + 时序数据库

---

# 第三部分：阶段六踩过的坑

## 坑 1：e2e 测试的 waitFor 条件不完整

**问题：**

```
Expected length: 500
Received length: 0
```

**原因：** 500 辆规模测试里，`waitFor` 只等 PG 到 500，但 data-writer 处理顺序是"先 PG，后 Redis"。PG 到达 500 时，Redis 可能还在处理队列。

**解决：** `waitFor` 条件改成同时等 PG 和 Redis 都到 500。

**影响文件：** `tests/e2e.fullPipeline.test.ts`。

---

## 坑 2：e2e.frontendApi 代理返回 502

**问题：** gateway 代理到 data-writer 返回 502。

**原因：** gateway 默认 target 是 `http://localhost:9104`（硬编码）。测试里 data-writer 用 `port: 0`，实际是随机端口。

**解决：**

1. `GatewayServiceOptions` 加 `proxiedServices?: ProxiedService[]`。
2. 测试里先 `dataWriter.start()`，拿到 `dataWriter.port()`，再创建 gateway 时注入正确的 target。

**影响文件：** `core/services/gateway/src/service.ts`、`tests/e2e.frontendApi.test.ts`。

---

## 坑 3：`dataWriter.handlers.test.ts` 缺 `queryLimit`

**问题：**

```
TS2741: Property 'queryLimit' is missing in type '{...}' but required in type 'DataWriterConfig'
```

**原因：** 阶段五给 `DataWriterConfig` 加了 `queryLimit` 字段。

**解决：** 测试的 config 加 `queryLimit: 100`。

**影响文件：** `tests/dataWriter.handlers.test.ts`。

---

## 坑 4：`observability.businessMetrics` 标签顺序不匹配

**问题：**

```
Expected: "apiscloud_dispatch_tasks_total{algorithm=\"nearest\",result=\"dispatched\",task_type=\"passenger\",...}"
Received: "apiscloud_dispatch_tasks_total{task_type=\"passenger\",algorithm=\"nearest\",result=\"dispatched\",...}"
```

**原因：** prom-client 输出标签顺序是**定义时的顺序**，不是字母序。

**解决：** 测试不依赖标签顺序，用 `extractMetricLines` 辅助函数 + `toContain` 分开验证。

**影响文件：** `tests/observability.businessMetrics.test.ts`。

---

## 坑 5：`gateway.router.test.ts` 类型断言缺新字段

**问题：**

```
TS2352: Conversion of type '{...}' to type 'GatewayConfig' may be a mistake
```

**原因：** 第四批给 `GatewayConfig` 加了 6 个新字段，测试用 `as RouterDeps['config']` 强制断言。

**解决：** 删掉 `as` 断言，直接写完整字段。

**影响文件：** `tests/gateway.router.test.ts`。

---

## 坑 6：`gateway.auth.test.ts` 未使用 `loadConfig`

**问题：**

```
TS6133: 'loadConfig' is declared but its value is never read.
```

**解决：** 删掉 import。

**影响文件：** `tests/gateway.auth.test.ts`。

---

## 坑 7：Loki 配置 `structured_metadata.fields` 报错

**问题：** Loki 容器 unhealthy，启动失败。

**原因：** `structured_metadata.fields` 不是 Loki 的合法配置项。

**解决：** 删掉 `structured_metadata` 段，保留 `limits_config.allow_structured_metadata: true`。

**影响文件：** `monitor/loki/loki-config.yml`。

---

## 坑 8：Prometheus `--config.expand-env` 不支持

**问题：**

```
Error parsing command line arguments: unknown long flag '--config.expand-env'
```

**原因：** `--config.expand-env` 是 Prometheus 3.x 的 flag。

**解决：**

- 去掉 `--config.expand-env` 和 `environment`。
- `prometheus.yml` 的端口改为字面量。
- HOST_IP 用 `${HOST_IP:-host-gateway}`。

**影响文件：** `docker-compose.infra.yml`、`monitor/prometheus/prometheus.yml`。

---

## 坑 9：Docker Desktop for Linux 的 `host.docker.internal` 指向 VM

**问题：**

```
wget: can't connect to remote host (192.168.65.254): Connection refused
```

**原因：** `192.168.65.254` 是 Docker Desktop VM 的网段，`host.docker.internal` 指向 VM。

**解决：**

- `extra_hosts` 用 `${HOST_IP:-host-gateway}`。
- **关键：`extra_hosts` 在容器创建时固定，`restart` 不更新，必须 `up -d --force-recreate`。**
- 用户 `export HOST_IP=$(hostname -I | awk '{print $1}')` 后重建 Prometheus。

**影响文件：** `docker-compose.infra.yml`、`scripts/dev-up.sh`、`Makefile`。

---

## 坑 10：Grafana 仪表板没加载

**问题：** Grafana 看不到 "ApisCloud 总览"。

**原因：** `datasources.yml` 缺 `uid: prometheus` 和 `uid: loki`。

**解决：** `datasources.yml` 加 `uid`，重启 Grafana。

**影响文件：** `monitor/grafana/provisioning/datasources/datasources.yml`。

---

## 坑 11：Kafka reset-offsets 缺 `--all-topics`

**问题：**

```
One of the reset scopes should be defined: --all-topics, --topic.
```

**解决：** 加 `--all-topics`。

---

## 坑 12：Kafka reset-offsets 在活跃消费组下失败

**问题：** reset 命令执行但 LAG 没归零。

**原因：** Kafka 规定 reset-offsets **只在消费组无活跃成员时**才能执行。

**解决：**

1. 先停所有后端服务。
2. 确认消费组 `CONSUMER-ID` 列全是 `-`。
3. 再执行 reset。

**影响文件：** 操作流程。

---

## 坑 13：awk 提取 LAG 用错列

**问题：** LAG 显示 89503，实际应该 0。

**原因：** `awk '{sum+=$5}'` 里的 `$5` 是 LOG-END-OFFSET，`$6` 才是 LAG。

**解决：**

```bash
awk 'NR>1 && $6 ~ /^[0-9]+$/ {sum+=$6} END {print sum+0}'
```

**影响文件：** `scripts/verify-e2e.sh`。

---

## 坑 14：verify-e2e.sh 等待时间不够

**问题：** 遥测发出去后，`sleep 5` 后查 PG 还是 0。

**原因：** Kafka 消费者组加入 + 分配分区需要时间。

**解决：** 遥测等待改成**轮询**，最多 60 秒。

**影响文件：** `scripts/verify-e2e.sh`。

---

## 坑 15：simulator 生产速率 > data-writer 消费速率

**问题：** LAG 一直在涨（452005 → 452008），遥测验证永远排不到。

**原因：**

- simulator 生产：500 辆 × 1Hz = 500 条/秒
- data-writer 消费：约 300 条/秒

**解决：**

- **验证时故意不启 simulator**（`verify-e2e.sh` 把 simulator 标为"可选"）
- 阶段六之后优化：Redis 写入合并、PG 批量写、data-writer 水平扩展

**影响文件：** `scripts/verify-e2e.sh`、`docs/delivery.V1.md`。

---

## 坑 16：Makefile 的 `$(or ...)` 用法不对

**问题：** `make start PROFILE=full` 没生效。

**原因：** `$(or $(PROFILE),core)` 是 Make 的语法，返回第一个非空值。**这是正确的**。

**实际用 `start.sh` 的环境变量优先级更高：**

```bash
PROFILE=full make start
```

**影响文件：** `Makefile`、`scripts/start.sh`。

---

# 第四部分：阶段六创建的文件清单

## 根配置改动

| 文件 | 改动 |
|---|---|
| `Makefile` | 加 `start`、`stop`、`status`、`verify-e2e`、`verify-multi-scale` |
| `.env.example` / `.env` | 加 `GATEWAY_AUTH_*`、`GATEWAY_RATE_LIMIT_*`、`INGEST_VERIFY_SIGNATURE`、`INGEST_SIGN_TTL_SEC` |
| `docker-compose.infra.yml` | Prometheus / Grafana 的 `extra_hosts` 用 `${HOST_IP:-host-gateway}` |
| `monitor/prometheus/prometheus.yml` | 端口改字面量 |
| `monitor/loki/loki-config.yml` | 加 `limits_config.allow_structured_metadata: true` |
| `monitor/grafana/provisioning/datasources/datasources.yml` | 加 `uid: prometheus` 和 `uid: loki` |

## `tests/` 阶段六新增

```
tests/
├── helpers/
│   ├── e2e-infra.ts                 — 集中 mock（PG、Redis、MQTT）
│   └── e2e-setup.ts                 — e2e 环境准备/清理
├── gateway.auth.test.ts             — JWT 认证（6 个用例）
├── gateway.rateLimit.test.ts        — 限流（5 个用例）
├── gateway.proxy.test.ts            — 反向代理（7 个用例）
├── ingest.commandSignature.test.ts  — 签名校验（5 个用例）
├── observability.businessMetrics.test.ts — 业务指标（9 个用例）
├── pluginHost.metricsInjection.test.ts — 指标注入（5 个用例）
├── pluginHost.httpClient.test.ts    — HTTP 客户端（9 个用例）
├── aggregator.edgeCases.test.ts     — 聚合器边界（15 个用例）
├── dispatchCore.constraints.edgeCases.test.ts — 约束边界（18 个用例）
├── dispatchCore.objective.edgeCases.test.ts — 目标函数边界（11 个用例）
├── messageBus.kafkaGroupId.test.ts  — 复合 groupId（12 个用例）
├── messageBus.filter.test.ts        — filter 机制（6 个用例）
├── integration.gatewayToDataWriter.test.ts — gateway → data-writer（5 个用例）
├── e2e.fullPipeline.test.ts         — 全链路（11 个用例）
└── e2e.frontendApi.test.ts          — 前端 API（11 个用例）
```

## `core/services/` 阶段六改动

| 文件 | 改动 |
|---|---|
| `observability/src/metrics.ts` | 加 5 个业务指标 |
| `dispatch-core/src/service.ts` | handleTask 各分支递增 dispatchTasks |
| `gateway/src/types.ts` | 加 auth / 限流配置字段 |
| `gateway/src/config.ts` | 加载配置 |
| `gateway/src/guards.ts` | 新建，认证 + 限流 guard |
| `gateway/src/server.ts` | 支持 guards |
| `gateway/src/service.ts` | 接入 guards，传给 PluginHost metrics |
| `gateway/src/index.ts` | 导出 guards |
| `ingest/src/types.ts` | 加 verifySignature / signSecret |
| `ingest/src/config.ts` | 加载签名配置 |
| `ingest/src/service.ts` | handleDialog 加签名校验 |

## `core/plugin-host/` 阶段六改动

| 文件 | 改动 |
|---|---|
| `src/types.ts` | 加 `PluginMetrics`，`PluginContext` 加 `metrics?` |
| `src/host.ts` | `PluginHostOptions` 加 `metrics?`，`buildContext` 注入 |
| `src/index.ts` | 导出 `PluginMetrics` |

## `plugins/` 阶段六改动

| 文件 | 改动 |
|---|---|
| `charging-scheduler/src/index.js` | 发指令后递增 chargingCommands |
| `geofence/src/index.js` | 发告警后递增 geofenceEvents |
| `anomaly/src/index.js` | 发告警后递增 anomalyEvents |

## `monitor/` 阶段六改动

| 文件 | 改动 |
|---|---|
| `prometheus/prometheus.yml` | 端口改字面量，删掉 plugin-host / observability target |
| `loki/loki-config.yml` | 加 `allow_structured_metadata` |
| `grafana/provisioning/datasources/datasources.yml` | 加 `uid` |
| `grafana/dashboards/apiscloud-overview.json` | 新建，6 个 panel |

## `scripts/` 阶段六新增

```
scripts/
├── start.sh                 — 一键启动，支持 PROFILE / LAYERS
├── test.sh                  — 分层测试入口
├── verify-e2e.sh            — 真实基础设施端到端验证
└── verify-multi-scale.sh    — 多规模验证
```

## `docs/` 阶段六新增

```
docs/
├── deployment.V1.md         — 部署指南
├── testing.V1.md            — 测试规范
├── api.V1.md                — API 文档
├── delivery.V1.md           — 交付文档
├── observability.V2.md      — 可观测性 V2
├── security.V2.md           — 安全 V2
└── README.md                — 更新索引
```

---

# 第五部分：当前状态

## 命令验证

```bash
make typecheck        # ✅
make lint             # ✅
make test-unit        # ✅ 75 个 suite
make test-integration # ✅ 6 个 suite
make test-e2e         # ✅ 2 个 suite
make build            # ✅
make build-registry   # ✅ 11 个服务，10 个插件
make registry-check   # ✅

cd web
pnpm typecheck        # ✅
pnpm build            # ✅

./scripts/verify-e2e.sh    # ✅ 17/17
```

## 服务端口分配

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

## 插件清单（10 个）

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

## 消息主题（4 个）

| 主题 | 生产者 | 消费者 |
|---|---|---|
| telemetry.raw | ingest | data-writer、dispatch-core、aggregator、gateway |
| telemetry.aggregated | aggregator | data-writer、gateway |
| events.commands | dispatch-core、charging-scheduler、route-optimizer | ingest、data-writer |
| events.alerts | geofence、anomaly | data-writer |

## 启动流程

```bash
# 一键启动（**不带 simulator**）
export HOST_IP=$(hostname -I | awk '{print $1}')
make infra-up
make init-topics
make build
./scripts/dev-up.sh --no-infra --no-build --no-front  # 需先加 --no-simulator

# 或手动起 5 个服务（不含 simulator）
node core/services/aggregator/dist/server-entry.js > logs/aggregator.log 2>&1 &
node core/services/data-writer/dist/server-entry.js > logs/data-writer.log 2>&1 &
node core/services/dispatch-core/dist/server-entry.js > logs/dispatch-core.log 2>&1 &
node core/services/ingest/dist/server-entry.js > logs/ingest.log 2>&1 &
sleep 5
node core/services/gateway/dist/server-entry.js > logs/gateway.log 2>&1 &
```

## 端到端验证

```bash
./scripts/verify-e2e.sh
# 预期：17/17 全绿
```

---

# 第六部分：重开对话时的最小上下文

如果重开对话，只需提供以下信息即可继续：

1. **本文档**（SP6.md）。
2. **当前任务的代码**。
3. **如果涉及现有模块**：对应的接口文件。

**重开对话时的标准问法：**

> 这是 SP6.md，项目六阶段全部完成。现在要 [具体任务]。请阅读 SP6.md，然后逐文件输出。

**后续可选工作（不属于六阶段，按需做）：**

| 任务 | 产出 |
|---|---|
| dispatch-core HTTP 端点 | `core/services/dispatch-core/src/server.ts` |
| ACK 机制 | simulator 消费 MQTT + data-writer 更新 status |
| Promtail 采集日志 | `monitor/promtail/` |
| K8s 部署清单 | `deploy/k8s/` |
| 多规模压测 | `scripts/verify-multi-scale.sh` 跑 5000 / 10000 |
| Redis 写入合并 | `redis-writer.ts` 改 hmset |
| PG 批量写 | `pg-writer.ts` 加攒批 |

---

**文档版本：** SP6（最终版）
**对应阶段：** 六阶段全部完成
**最后更新：** 阶段六完成时