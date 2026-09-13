# ApisCloud - 蜂云 项目进度文档 SP3

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

**阶段文档：**

- `docs/architecture.V1.md`
- `docs/infra.V1.md`
- `docs/messageBus.V1.md`
- `docs/layerConfig.V1.md`
- `docs/pluginHost.V1.md`
- `docs/observability.V1.md`
- `docs/security.V1.md`
- `docs/cicd.V1.md`

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

**阶段文档：**

- `docs/simulator.V1.md`
- `docs/ingest.V1.md`
- `docs/dataWriter.V1.md`
- `docs/messageBus.V2.md`

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

**阶段文档：**

- `docs/dispatchCore.V1.md`
- `docs/geofence.V1.md`
- `docs/anomaly.V1.md`

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
| 4.1 | 开发 gateway | 路由注入 + 反向代理 | core/gateway/ |
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

**阶段文档：**

- `docs/gateway.V1.md`
- `docs/pluginHost.V1.md`
- `docs/webShell.V1.md`
- `docs/dashboard.V1.md`
- `docs/layerConfig.V2.md`

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

**阶段文档：**

- `docs/chargingScheduler.V1.md`
- `docs/routeOptimizer.V1.md`
- `docs/reporting.V1.md`
- `docs/messageBus.V3.md`
- `docs/layerConfig.V3.md`
- `docs/busPerformance.V1.md`

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

**阶段文档：**

- `docs/deployment.V1.md`
- `docs/testing.V1.md`
- `docs/observability.V2.md`
- `docs/security.V2.md`
- `docs/api.V1.md`

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

# 第二部分：已完成部分（阶段一、二、三）

## 阶段一：基础设施与共享库 ✅ 已完成

阶段一全部 13 项任务已完成。实际执行时，在原计划前额外做了一步**工程初始化**（monorepo 骨架），然后依次完成 1.1 到 1.13。

### 1.0 工程初始化（原计划外的前置步骤）

**怎么完成：**

- 建 monorepo：`pnpm-workspace.yaml` 声明 7 个包路径。
- 统一 TS：`tsconfig.base.json` + 6 个子包 `tsconfig.json`（用 project references 建立 DAG）。
- 统一代码规范：ESLint 8 + @typescript-eslint 8 + Prettier 3。
- 统一测试：Jest 29 + ts-jest。
- 统一命令入口：Makefile。
- 环境变量：`.env.example` + `.env`。

**关键设计：**

- 6 个子包全部输出 CommonJS，Jest 可直接 require。
- `tsBuildInfoFile: "dist/.tsbuildinfo"` 避免 VS Code 和 CLI 抢同一个文件。
- project references 严格单向，杜绝循环。

### 1.1 + 1.2 基础设施编排 + 数据库初始化

**怎么完成：**

- `docker-compose.infra.yml` 编排 7 个服务：PostgreSQL 16、Redis 7、EMQX 5.8、Kafka 3.7（KRaft）、Prometheus 2.54、Loki 3.1、Grafana 11.2。
- `deploy/postgres/init.sql` 建 4 张表 + 1 视图：`vehicle_latest`、`vehicle_telemetry`、`alerts`、`dispatch_commands`、`health_check`。
- 端口调整：EMQX `1883 → 11883`，Grafana `3000 → 13000`。
- 7 个 named volume，`infra-down` 保数据，`infra-reset` 删数据。
- Makefile 加 5 个命令：`infra-up`、`infra-down`、`infra-logs`、`infra-ps`、`infra-reset`。

### 1.3 共享库 `core/libs`

**怎么完成：**

8 个模块：

| 模块 | 能力 |
|---|---|
| config | dotenv + zod 校验，缺关键字段启动失败，带缓存和 reset |
| logger | pino JSON，字段含 `trace_id`、`span_id`、`service`、`plugin`、`layer` |
| health | 注册式健康检查，聚合 `ok/degraded/down` |
| pg | `pg.Pool`，query、transaction、health、close、raw |
| redis | ioredis 封装，get/set/hset/hgetall/publish/subscribe/health |
| mqtt | mqtt.js 封装，publish/subscribe/health/close，自动重连 |
| metrics | prom-client，counter/gauge/histogram，默认标签 `service` |
| security | JWT、zod 输入校验、密钥管理、指令签名、限流、防重放 |

### 1.4 消息总线抽象层 `shared/message-bus`

**怎么完成：**

- `topics.ts`：4 个主题常量。
- `envelope.ts`：统一消息信封，zod 校验，自动生成 `trace_id`、`span_id`。
- `interface.ts`：`MessageBus` 统一接口，含 connect/publish/subscribe/commit/health/close。
- 3 个适配器：MemoryAdapter、MqttAdapter、KafkaAdapter。
- `factory.ts`：按 `MESSAGE_BUS` 创建实例，用 `never` 做 exhaustive 检查。

### 1.5 层配置 `shared/layer-config`

**怎么完成：**

- `layers.yml`：单层 `single`，10 个核心服务。
- `schema.ts`：zod 校验，`KNOWN_SERVICES` 白名单，层名正则。
- `loader.ts`：`loadLayers`、`getLayer`、`getServices`、`getLayerNames`、`isServiceEnabled`。
- build 脚本把 `layers.yml` 复制到 dist。

### 1.6 插件宿主 `core/plugin-host`

**怎么完成：**

- 8 个模块：types、schema、guard、loader、registry、lifecycle、host、index。
- `Plugin` 接口 6 个可选钩子：onLoad/onUnload/onMessage/onTimer/getRoutes/getHealth。
- `PluginHost` 8 个公开方法：register/loadAll/unloadAll/dispatchMessage/dispatchTimer/getRoutes/health/getRegistry。
- 保护：异常隔离（每个回调 try/catch）、超时控制（onLoad 5s、onMessage 1s）。
- 模板插件 `plugins/_template/`。

### 1.7 可观测性服务 `core/services/observability`

**怎么完成：**

- 9 个指标：服务层（httpRequests/httpDuration）、数据流层（dataFlowMessages/dataFlowLatency）、插件层（pluginActions/pluginDuration）、总线层（busPublished/busConsumed/busLag）。
- 两个端点：`/metrics`、`/health`。
- 日志统一 pino JSON，含 `trace_id`、`span_id`。
- `Tracer` 类为 OpenTelemetry 预留。
- 支持独立启动和内嵌使用。

### 1.8 CI 配置 `.github/workflows/`

**怎么完成：**

- `ci.yml`：5 个并行 job（lint、typecheck、test-unit、build、registry-check）+ 1 个汇总。
- `security.yml`：gitleaks + pnpm audit，每周一自动跑。
- `dependabot.yml`：npm、GitHub Actions、Docker 三生态。
- PR 模板、Issue 模板、`.gitleaks.toml`。

### 1.9 registry `scripts/`

**怎么完成：**

- `scripts/lib/scanner.js`：扫描 `plugin.json`，跳过 `_`、`.` 开头目录。
- `scripts/lib/validator.js`：校验 manifest，补默认值。
- `scripts/lib/topo.js`：Kahn 算法拓扑排序，稳定输出，检测循环依赖。
- `scripts/lib/profiles.js`：profile → 插件名列表，加 `all` 伪 profile。
- `scripts/build-registry.js`：导出 `buildRegistry`，CLI 和单测共用。
- 10 个核心服务 `plugin.json` + 示例插件。
- registry.json 结构：version、generatedAt、generator、coreVersion、services、plugins、byProfile、topologicalOrder、stats。

### 1.10 docs、1.11 tests、1.12 安全基础、1.13 文档

**docs：**

- `docs/README.md` + 8 个阶段一功能文档。
- 命名：`功能名.V几.md`。
- 模板：功能目标 / 基础实现 / V1 修改 / 后续版本。

**tests：**

- 扁平结构，命名 `功能名.（附加说明）.test.ts`。
- 前缀区分层级：无前缀=单元，`integration.`=集成，`e2e.`=端到端。
- helpers：makeEnvelope、makePlugin、waitFor。
- 阶段一 23 个 suite、142 个测试全绿。

**安全基础：**

- 9 个子模块：constants、jwt、auth、validation、secrets、command-signature、rate-limiter、replay-guard、index。
- JWT HS256，访问 token 1h，refresh 7d。
- 认证中间件兼容原生 http 和 Express 风格。
- 10 个常用 schema。
- 指令签名：HMAC-SHA256 + canonicalize + timingSafeEqual + 时间窗。
- 限流器和防重放当前内存版，多实例需 Redis 版。

---

## 阶段二：核心数据流服务 ✅ 已完成

### 2.0 根配置改动

**怎么完成：**

- `tsconfig.base.json` 加 3 组 paths：`@apiscloud/simulator`、`@apiscloud/ingest`、`@apiscloud/data-writer`。
- 根 `tsconfig.json` 加 3 个 references。
- `jest.config.js` 加 6 条 `moduleNameMapper` + 3 条 `collectCoverageFrom`。
- `.env` 加 `SIMULATOR_PORT=9107`。
- `.env.example` 同步 MQTT 端口 11883、Grafana 端口 13000。
- `prometheus.yml` 加 simulator target。
- `.eslintrc.json` 忽略 `_` 前缀未使用变量。
- Makefile 加 `init-topics`。
- 根 `package.json` 加 `kafkajs`。

### 2.1 simulator `core/services/simulator/`

**怎么完成：**

- 模拟外部自动驾驶系统，产生 500 辆车状态，通过 MQTT 上报。
- 不碰消息总线，不写库。
- 状态机 + GPS 生成器 + 车队管理。
- 暴露 `/metrics`、`/health`，端口 9107。
- 8 个环境变量可配。
- 状态机覆盖 idle / running / charging / maintenance / offline。
- 电量：running 每秒耗 0.1%，charging 每秒充 2%。
- 实机验证：500 辆车，1 秒间隔，25 秒 12500 条。

### 2.2 ingest `core/services/ingest/`

**怎么完成：**

- 唯一外部出入口。
- 上行：MQTT `telemetry/raw` → 校验 → Envelope → 总线 `telemetry.raw`。
- 下行：总线 `events.commands` → 校验 → MQTT `commands/{vehicle_id}`。
- 暴露 `/metrics`、`/health`，端口 9103。
- 输入校验用 zod，复用 libs 的 `VehicleId`、`Latitude`、`Longitude`、`Battery`。
- 可注入 `mqttSubscriber`、`mqttPublisher`、`bus`。
- 总线发布 `partitionKey = vehicle_id`。
- 消费者组 `apiscloud-ingest`。

### 2.3 data-writer `core/services/data-writer/`

**怎么完成：**

- 唯一写库者，只订阅总线，不连 MQTT。
- 订阅 3 个主题：`telemetry.raw`、`telemetry.aggregated`、`events.alerts`（阶段三加 `events.commands`）。
- 写 PG：`vehicle_latest` UPSERT、`vehicle_telemetry` INSERT、`alerts` INSERT、`dispatch_commands` INSERT（阶段三加）。
- 写 Redis 热路径：`vehicle:{id}:latest` TTL 60s、`vehicle:{id}` hash、`vehicles:active` set、`alerts:recent` list、`region:{region}:stats` hash。
- 暴露 `/metrics`、`/health`，端口 9104。
- 可注入 `pg`、`redis`、`bus`。
- 消费者组 `apiscloud-data-writer`。

### 2.4 主题确认 + Kafka 初始化

**怎么完成：**

| 主题 | 分区数 | 保留 |
|---|---|---|
| telemetry.raw | 6 | 6h |
| telemetry.aggregated | 3 | 72h |
| events.commands | 3 | 7d |
| events.alerts | 3 | 7d |

- `tests/messageBus.topics.test.ts` 锁定主题常量。
- `scripts/init-kafka-topics.js` 幂等创建主题。
- Makefile `make init-topics`。

### 2.5-2.7 单元测试

- simulator：5 个 suite，63 个测试。
- ingest：5 个 suite，约 30 个测试。
- data-writer：5 个 suite，约 30 个测试。
- messageBus topics：9 个测试。

### 2.8 集成测试

`tests/integration.mqttToPg.test.ts`，13 个测试。

- 用共享 `MemoryAdapter`。
- Mock MQTT、Mock PG、Mock Redis。
- 覆盖上行、下行、边界、规模。

### 2.9-2.10 文档

- `docs/simulator.V1.md`、`docs/ingest.V1.md`、`docs/dataWriter.V1.md`。
- `docs/messageBus.V2.md`（替代 V1）。
- `docs/architecture.V2.md`（替代 V1）。

---

## 阶段三：核心业务服务与调度算法 ✅ 已完成

### 3.0 根配置改动

**怎么完成：**

- `tsconfig.base.json` 加 2 条 `@apiscloud/dispatch-core` paths。
- 根 `tsconfig.json` 加 dispatch-core reference。
- `.env.example` 和 `.env` 加 dispatch 配置（端口、算法、超时、权重、签名密钥、运营区域）。
- `jest.config.js` 加 moduleNameMapper 和 collectCoverageFrom。
- `scripts/build-registry.js` 改 `pluginDirs` 为数组，支持 `[plugins/, plugins/dispatch/]`。

### 3.1 dispatch-core `core/services/dispatch-core/`

**怎么完成：**

- 14 个文件：index、server-entry、types、config、validation、geo、constraints、objective、algorithm-interface、algorithm-registry、algorithm-loader、command-builder、mapper、service。
- 订阅 `telemetry.raw`，累积车辆注册表。
- 任务提交走完整调度流程：硬约束过滤 → 算法排序 → 构建命令 → 签名 → 发 `events.commands`。
- 算法插件从 `plugins/dispatch/*/` 加载，失败/超时回退到 nearest。
- 暴露 `/metrics`、`/health`，端口 9105。
- 消费者组 `apiscloud-dispatch-core`。

### 3.2-3.4 3 个算法插件

**怎么完成：**

| 插件 | 核心逻辑 |
|---|---|
| nearest | Haversine 距离排序，score = -distance |
| batch-match | 多因素成本最小化，cost = distance/50 - 0.3×battery/100 - 0.2×capability |
| priority-dispatch | 动态权重，distanceWeight = 0.2 + priorityNorm×0.8 |

每个插件在 `src/index.js` 导出 `{ algorithm: { name, version, rank } }`。

### 3.5-3.6 geofence、anomaly 插件

**怎么完成：**

- geofence：zones.json（圆形围栏）+ geofence.js（纯逻辑）+ index.js（插件入口）。
- anomaly：detectors.js（纯逻辑）+ index.js（插件入口）。
- 纯逻辑 + 薄插件封装，`onMessage` 里判断 `bus` 是否存在。
- 首次观测不告警，只记录状态。
- 阶段三不接入 plugin-host，阶段四再接入。

### 3.7-3.9 单元测试

- `dispatch.nearest.test.ts`、`dispatch.batchMatch.test.ts`、`dispatch.priority.test.ts`。
- `geofence.zoneDetection.test.ts`。
- `anomaly.speedThreshold.test.ts`。

### 3.10 集成测试

- `tests/integration.dispatchFlow.test.ts`：10 个测试，调度流端到端。
- `tests/integration.alertFlow.test.ts`：13 个测试，告警流端到端。

### 3.11 文档

- `docs/dispatchCore.V1.md`、`docs/nearestDispatch.V1.md`、`docs/batchMatch.V1.md`、`docs/priorityDispatch.V1.md`、`docs/geofence.V1.md`、`docs/anomaly.V1.md`。
- `docs/README.md` 更新索引。

### 阶段三产出汇总

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

### 阶段三最终测试结果

| 类别 | Suite 数 | 状态 |
|---|---|---|
| 单元测试 | 45 | ✅ 313 个测试全绿 |
| 集成测试 | 3 | ✅ 全绿 |

### 阶段三最终命令验证

```bash
make typecheck        # ✅
make lint             # ✅
make test-unit        # ✅
make test-integration # ✅ 3 个 suite
make build            # ✅
make build-registry   # ✅ 6 个插件
make registry-check   # ✅
```

---

## 还没完成的部分

| 阶段 | 状态 | 未完成内容 |
|---|---|---|
| 阶段一 | ✅ 已完成 | 无 |
| 阶段二 | ✅ 已完成 | 无 |
| 阶段三 | ✅ 已完成 | 无（geofence/anomaly 接入 plugin-host 是阶段四任务） |
| 阶段四 | ⬜ 未开始 | gateway、前端外壳、dashboard、前端插件加载器、geofence/anomaly 接入 plugin-host |
| 阶段五 | ⬜ 未开始 | 插件生态、消息总线性能优化 |
| 阶段六 | ⬜ 未开始 | 测试完善、可观测性完善、安全完善、部署、交付 |

**阶段三遗留的两件事（已确认为阶段四任务）：**

1. **geofence/anomaly 接入 plugin-host**：阶段四在 `PluginHost.buildContext` 加 `bus` 注入，插件自动生效。
2. **实机端到端验证**：调度流和告警流都已被集成测试覆盖，实机验证可以推迟到阶段六。

---

# 第三部分：阶段三踩过的坑

## 坑 1：`DispatchAlgorithm.rank` 返回类型导致测试 TS 报错

**问题：**

```
TS2339: Property 'ranked' does not exist on type
'DispatchAlgorithmResult | Promise<DispatchAlgorithmResult>'
```

**原因：** `rank` 返回 `Promise<DispatchAlgorithmResult> | DispatchAlgorithmResult`，测试里 `const result = nearest.rank(...)` 类型是联合类型，不能直接访问 `.ranked`。

**解决：** 测试改成 `async/await`。`await` 对同步返回值和 Promise 都适用，接口保持灵活性。

**影响文件：** `tests/dispatch.nearest.test.ts`、`tests/dispatch.batchMatch.test.ts`、`tests/dispatch.priority.test.ts`。

---

## 坑 2：priority-dispatch 低优先级测试失败

**问题：** `低优先级任务偏好电量高的车` 期望 `v-far-highbat`，实际 `v-near-lowbat`。

**原因：** 原公式 `distanceWeight = 0.5 + priorityNorm × 0.5`（0.5~1.0）、`batteryWeight = 0.5 - priorityNorm × 0.3`（0.5~0.2），低优先级时两者相当。距离项在 45km 时接近满量程 -1，电量项最大 +1，抵消后距离优势仍胜出。

**解决：** 拉大权重差：

```
distanceWeight = 0.2 + priorityNorm * 0.8   // 0.2 ~ 1.0
batteryWeight  = 1.0 - distanceWeight       // 0.8 ~ 0.0
```

`priority=0` 时电量权重 0.8，明显主导；`priority=100` 时距离权重 1.0，完全主导；中间平滑过渡。

**影响文件：** `plugins/dispatch/priority-dispatch/src/index.js`。

---

## 坑 3：测试里 `const require = createRequire(__filename)` 报 TS2441

**问题：**

```
TS2441: Duplicate identifier 'require'.
Compiler reserves name 'require' in top level scope of a module.
```

**原因：** TS 在模块顶层保留 `require` 名字。

**解决：** 项目输出 CommonJS，`require` 全局可用，直接 `require()` + `/* eslint-disable @typescript-eslint/no-require-imports */`。

**影响文件：** `tests/geofence.zoneDetection.test.ts`、`tests/anomaly.speedThreshold.test.ts`、`tests/integration.alertFlow.test.ts`。

---

## 坑 4：`// eslint-disable-next-line` 没覆盖多行 `require()`

**问题：** `anomaly.speedThreshold.test.ts` 的 `require()` 在多行解构里，第 2 行的注释只作用于第 3 行。

**原因：** `eslint-disable-next-line` 只作用于紧邻的下一行。

**解决：** 改成文件级 `/* eslint-disable @typescript-eslint/no-require-imports */`。顺带给 geofence 测试也改成文件级，风格一致。

**影响文件：** `tests/anomaly.speedThreshold.test.ts`、`tests/geofence.zoneDetection.test.ts`。

---

## 坑 5：`dataWriter.handlers.test.ts` MockPgWriter 缺 `insertDispatchCommand`

**问题：**

```
TS2741: Property 'insertDispatchCommand' is missing in type
'{...}' but required in type 'MockPgWriter'.
```

**原因：** `PgWriter` 接口新增了 `insertDispatchCommand`，Mock 没同步。

**解决：** 在 `createMockPgWriter` 里加一个空实现。

**教训：** 新增 `PgWriter` 方法后，所有 MockPgWriter 都要同步加方法。

**影响文件：** `tests/dataWriter.handlers.test.ts`。

---

## 坑 6：`dataWriter.eventsCommands.test.ts` 找不到导出

**问题：**

```
TS2305: Module '"@apiscloud/data-writer"' has no exported member
'handleEventsCommands'.
```

**原因：** 第五批的 `index.ts` 没覆盖。

**解决：** 重新写 `index.ts`，加 `handleEventsCommands`、`EventsCommandsDeps`、`DispatchCommandPayload` 等导出。

**影响文件：** `core/services/data-writer/src/index.ts`。

---

# 第四部分：项目文件清单（当前状态）

## 根目录

```
ApisCloud/
├── package.json                  — monorepo 根配置
├── pnpm-workspace.yaml           — workspace 包路径声明
├── pnpm-lock.yaml                — 依赖锁文件
├── tsconfig.base.json            — TS 共享配置，含 paths 和 tsBuildInfoFile
├── tsconfig.json                 — 根项目引用，列出所有子包
├── jest.config.js                — Jest 全局配置
├── .eslintrc.json                — ESLint 配置
├── .eslintignore                 — ESLint 排除
├── .prettierrc                   — Prettier 配置
├── .prettierignore               — Prettier 排除
├── .editorconfig                 — 编辑器统一配置
├── .gitignore                    — Git 排除
├── .gitleaks.toml                — 密钥扫描白名单
├── .env.example                  — 环境变量模板
├── .env                          — 本地环境变量（不进 Git）
├── Makefile                      — 统一命令入口
├── docker-compose.infra.yml      — 基础设施编排
├── README.md                     — 项目说明
```

## `core/libs/` — 共享库

```
core/libs/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── config/
    │   ├── schema.ts             — zod schema，环境变量契约
    │   └── index.ts              — loadConfig、resetConfig
    ├── logger/
    │   ├── types.ts              — LogContext、LoggerOptions
    │   └── index.ts              — createLogger、withContext
    ├── health/
    │   ├── types.ts              — HealthState、HealthCheckResult、HealthReport
    │   └── index.ts              — HealthRegistry
    ├── pg/index.ts               — createPg
    ├── redis/index.ts            — createRedis
    ├── mqtt/index.ts             — createMqtt
    ├── metrics/index.ts          — createMetrics
    └── security/
        ├── constants.ts
        ├── jwt.ts
        ├── auth.ts
        ├── validation.ts
        ├── secrets.ts
        ├── command-signature.ts
        ├── rate-limiter.ts
        ├── replay-guard.ts
        └── index.ts
```

## `core/plugin-host/` — 插件宿主

```
core/plugin-host/
├── package.json
├── tsconfig.json
└── src/
    ├── types.ts
    ├── schema.ts
    ├── guard.ts
    ├── loader.ts
    ├── registry.ts
    ├── lifecycle.ts
    ├── host.ts
    └── index.ts
```

## `core/services/observability/` — 可观测性

```
core/services/observability/
├── package.json
├── tsconfig.json
└── src/
    ├── types.ts
    ├── metrics.ts
    ├── health.ts
    ├── logger.ts
    ├── tracing.ts
    ├── server.ts
    ├── service.ts
    ├── index.ts
    └── server-entry.ts
```

## `core/services/simulator/` — 模拟器（阶段二）

```
core/services/simulator/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts
    ├── config.ts
    ├── gps-generator.ts
    ├── state-machine.ts
    ├── vehicle.ts
    ├── fleet.ts
    ├── mqtt-publisher.ts
    └── service.ts
```

## `core/services/ingest/` — MQTT 出入口（阶段二）

```
core/services/ingest/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts
    ├── config.ts
    ├── validation.ts
    ├── mapper.ts
    ├── mqtt-subscriber.ts
    ├── mqtt-publisher.ts
    ├── bus-publisher.ts
    ├── bus-subscriber.ts
    └── service.ts
```

## `core/services/data-writer/` — 统一写库（阶段二 + 阶段三扩展）

```
core/services/data-writer/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts                  — 含 DispatchCommandPayload（阶段三加）
    ├── config.ts
    ├── mapper.ts                 — 含 extractDispatchCommand、commandToPgParams（阶段三加）
    ├── pg-writer.ts              — 含 insertDispatchCommand（阶段三加）
    ├── redis-writer.ts
    ├── handlers/
    │   ├── telemetry-raw.ts
    │   ├── telemetry-aggregated.ts
    │   ├── events-alerts.ts
    │   └── events-commands.ts    — 阶段三新建
    └── service.ts                — 订阅 4 个主题（阶段三加 events.commands）
```

## `core/services/dispatch-core/` — 调度核心（阶段三）

```
core/services/dispatch-core/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                  — 统一出口
    ├── server-entry.ts           — 独立启动
    ├── types.ts                  — Task、DispatchVehicle、DispatchCommand
    ├── config.ts                 — loadDispatchCoreConfig
    ├── validation.ts             — TaskSchema、VehicleSchema
    ├── geo.ts                    — Haversine、ETA、半径
    ├── constraints.ts            — 硬约束过滤
    ├── objective.ts              — 目标函数加权
    ├── algorithm-interface.ts    — DispatchAlgorithm 接口
    ├── algorithm-registry.ts     — 算法注册表
    ├── algorithm-loader.ts       — 加载算法插件
    ├── command-builder.ts        — 命令构建 + 签名
    ├── mapper.ts                 — Envelope ↔ Task/Command
    └── service.ts                — 服务组合
```

## `core/registry/` — 注册表

```
core/registry/
├── .gitkeep
└── registry.json                 — 生成产物（不进 Git）
```

## `core/services/*/plugin.json` — 核心服务 manifest

10 个核心服务的 `plugin.json`。阶段三修改了 `data-writer` 的 subscribe 加 `events.commands`。

## `shared/message-bus/` — 消息总线

```
shared/message-bus/
├── package.json
├── tsconfig.json
├── interface.ts
├── envelope.ts
├── topics.ts
├── factory.ts
├── index.ts
└── adapters/
    ├── memory.ts
    ├── mqtt.ts
    └── kafka.ts
```

## `shared/types/` 和 `shared/contracts/`

```
shared/types/
├── package.json
├── tsconfig.json
└── index.ts

shared/contracts/
├── package.json
├── tsconfig.json
└── index.ts
```

## `shared/layer-config/` — 层配置

```
shared/layer-config/
├── package.json
├── tsconfig.json
├── layers.yml
├── schema.ts
├── loader.ts
└── index.ts
```

## `plugins/` — 插件目录

```
plugins/
├── _template/                    — 模板插件（扫描时跳过）
│   ├── plugin.json
│   └── src/index.js
├── example-plugin/               — 示例插件
│   ├── plugin.json
│   └── src/index.js
├── dispatch/                     — 调度算法插件（阶段三）
│   ├── nearest/
│   │   ├── plugin.json
│   │   └── src/index.js
│   ├── batch-match/
│   │   ├── plugin.json
│   │   └── src/index.js
│   └── priority-dispatch/
│       ├── plugin.json
│       └── src/index.js
├── geofence/                     — 地理围栏插件（阶段三）
│   ├── plugin.json
│   ├── zones.json
│   └── src/
│       ├── geofence.js
│       └── index.js
└── anomaly/                      — 异常检测插件（阶段三）
    ├── plugin.json
    └── src/
        ├── detectors.js
        └── index.js
```

## `scripts/` — 构建脚本

```
scripts/
├── build-registry.js             — 主入口，支持多扫描目录（阶段三改）
├── check-registry.js             — 校验 registry 结构
├── init-kafka-topics.js          — 幂等创建 Kafka 主题
└── lib/
    ├── scanner.js                — 遍历目录找 plugin.json
    ├── validator.js              — 校验 manifest
    ├── topo.js                   — 拓扑排序
    └── profiles.js               — profile 索引
```

## `tests/` — 测试目录（扁平）

```
tests/
├── README.md
├── setup.js
├── helpers/
│   ├── index.ts
│   ├── envelope.ts
│   ├── plugin.ts
│   └── wait.ts
├── smoke.init.test.ts
├── helpers.test.ts
├── libs.config.test.ts
├── libs.health.test.ts
├── libs.metrics.test.ts
├── libs.security.test.ts
├── messageBus.envelope.test.ts
├── messageBus.memory.test.ts
├── messageBus.switch.test.ts
├── messageBus.topics.test.ts
├── layerConfig.load.test.ts
├── layerConfig.addLayer.test.ts
├── pluginHost.loadPlugin.test.ts
├── pluginHost.registry.test.ts
├── pluginHost.guard.test.ts
├── pluginHost.host.test.ts
├── observability.collect.test.ts
├── registry.build.test.ts
├── security.jwt.test.ts
├── security.auth.test.ts
├── security.commandSignature.test.ts
├── security.rateLimiter.test.ts
├── security.replayGuard.test.ts
├── security.secrets.test.ts
├── simulator.stateMachine.test.ts
├── simulator.gpsGenerator.test.ts
├── simulator.vehicle.test.ts
├── simulator.fleet.test.ts
├── simulator.config.test.ts
├── ingest.validation.test.ts
├── ingest.mapper.test.ts
├── ingest.config.test.ts
├── ingest.mqttToBus.test.ts
├── ingest.busToMqtt.test.ts
├── dataWriter.config.test.ts
├── dataWriter.mapper.test.ts
├── dataWriter.pgWriter.test.ts
├── dataWriter.redisWriter.test.ts
├── dataWriter.handlers.test.ts
├── dataWriter.eventsCommands.test.ts           ← 阶段三新增
├── dispatch.nearest.test.ts                     ← 阶段三新增
├── dispatch.batchMatch.test.ts                  ← 阶段三新增
├── dispatch.priority.test.ts                    ← 阶段三新增
├── geofence.zoneDetection.test.ts               ← 阶段三新增
├── anomaly.speedThreshold.test.ts               ← 阶段三新增
├── integration.mqttToPg.test.ts
├── integration.dispatchFlow.test.ts             ← 阶段三新增
├── integration.alertFlow.test.ts                ← 阶段三新增
├── jest.config.js
└── setup.js
```

## `docs/` — 文档

```
docs/
├── README.md                     — 文档索引
├── architecture.V2.md
├── infra.V1.md
├── messageBus.V2.md
├── layerConfig.V1.md
├── pluginHost.V1.md
├── observability.V1.md
├── security.V1.md
├── cicd.V1.md
├── simulator.V1.md
├── ingest.V1.md
├── dataWriter.V1.md
├── dispatchCore.V1.md            ← 阶段三新增
├── nearestDispatch.V1.md         ← 阶段三新增
├── batchMatch.V1.md              ← 阶段三新增
├── priorityDispatch.V1.md        ← 阶段三新增
├── geofence.V1.md                ← 阶段三新增
└── anomaly.V1.md                 ← 阶段三新增
```

## `deploy/` — 部署配置

```
deploy/
├── postgres/init.sql             — 数据库初始化
├── redis/redis.conf              — Redis 配置
├── emqx/emqx.conf                — EMQX 配置
├── single-layer/.gitkeep
└── multi-layer/.gitkeep
```

## `monitor/` — 监控配置

```
monitor/
├── prometheus/prometheus.yml     — 抓取配置
├── loki/loki-config.yml
└── grafana/
    ├── provisioning/
    │   ├── datasources/datasources.yml
    │   └── dashboards/dashboards.yml
    └── dashboards/
```

## `.github/` — GitHub 配置

```
.github/
├── workflows/
│   ├── ci.yml
│   └── security.yml
├── ISSUE_TEMPLATE/
│   └── bug_report.md
├── PULL_REQUEST_TEMPLATE.md
└── dependabot.yml
```

## `web/` — 前端外壳（待阶段四）

```
web/
└── .gitkeep
```

---

# 第五部分：当前状态与下一步

## 当前命令验证

```bash
make typecheck        # ✅ 通过
make lint             # ✅ 通过，0 warning
make test-unit        # ✅ 45 个 suite，313 个测试全绿
make test-integration # ✅ 3 个 suite 全绿
make build            # ✅ 全部构建成功
make infra-up         # ✅ 7 个服务 healthy
make build-registry   # ✅ 生成 registry.json，10 个服务，6 个插件
make registry-check   # ✅ registry 校验通过
make init-topics      # ✅ 需要 Kafka 启动才能跑
```

## 当前服务端口分配

| 服务 | 端口 | 状态 |
|---|---|---|
| gateway | 9101 | 阶段四 |
| plugin-host | 9102 | 阶段一 |
| ingest | 9103 | 阶段二 ✅ |
| data-writer | 9104 | 阶段二 ✅ |
| dispatch-core | 9105 | 阶段三 ✅ |
| observability | 9106 | 阶段一 |
| simulator | 9107 | 阶段二 ✅ |

## 当前消息主题

| 主题 | 分区数 | 保留 | 生产者 | 消费者 |
|---|---|---|---|---|
| telemetry.raw | 6 | 6h | ingest（从 MQTT 转） | data-writer（apiscloud-data-writer）、dispatch-core（apiscloud-dispatch-core） |
| telemetry.aggregated | 3 | 72h | 待定 | data-writer |
| events.commands | 3 | 7d | dispatch-core | ingest（apiscloud-ingest）、data-writer（apiscloud-data-writer） |
| events.alerts | 3 | 7d | geofence、anomaly | data-writer（apiscloud-data-writer） |

## 当前算法插件

| 插件 | profile | 说明 |
|---|---|---|
| nearest | core, full | 最近邻，默认算法 |
| batch-match | core, full | 批量匹配 |
| priority-dispatch | core, full | 优先级调度 |

## 下一步：阶段四

**阶段目标：** 建立进程内插件机制和前端宿主，让功能可插拔。

**要做的：**

| 序号 | 任务 | 产出 |
|---|---|---|
| 4.1 | 开发 gateway | `core/gateway/` |
| 4.2 | plugin-host 注入 bus | `core/plugin-host/src/host.ts` 改 buildContext |
| 4.3 | geofence/anomaly 接入 plugin-host | 插件在 onLoad 里调 setBus(ctx.bus) |
| 4.4 | 开发前端外壳 | `web/` |
| 4.5 | 开发前端插件加载器 | 动态 import、路由注册、导航生成 |
| 4.6 | 开发基础 UI 组件 | 按钮、卡片、表格 |
| 4.7 | 开发 dashboard | `plugins/dashboard/` |
| 4.8 | 编写 plugin-host 测试 | `tests/pluginHost.*.test.ts` |
| 4.9 | 编写层配置测试 | `tests/layerConfig.addLayer.test.ts` |
| 4.10 | 编写功能文档 | `gateway.V1.md`、`webShell.V1.md`、`dashboard.V1.md` |

**阶段四开工前必须看的关键代码：**

1. `core/plugin-host/src/host.ts` 的 `buildContext`：要在 `ctx` 里注入 `bus`。
2. `core/plugin-host/src/types.ts` 的 `PluginContext`：要加可选 `bus` 字段。
3. `plugins/geofence/src/index.js` 的 `setBus`：阶段四在 `onLoad` 里调 `setBus(ctx.bus)`。
4. `plugins/anomaly/src/index.js` 的 `setBus`：同 geofence。
5. `tests/pluginHost.host.test.ts`：阶段四加 bus 后要更新测试。
6. `tests/integration.alertFlow.test.ts`：阶段四接入 plugin-host 后要改成走 PluginHost 分发。
7. `docs/pluginHost.V1.md`：阶段四写 V2 文档。

**阶段四关键决策：**

1. **plugin-host 的 bus 注入**：`PluginContext` 加可选 `bus?: MessageBus`，`buildContext` 里注入 `this.bus`。
2. **PluginHost 构造需要 bus**：`PluginHostOptions` 加 `bus?: MessageBus`。
3. **geofence/anomaly 接入后，告警流走 PluginHost**：`host.dispatchMessage('telemetry.raw', env)` 触发插件 `onMessage`。
4. **gateway 路由注入**：插件 `getRoutes()` 返回的路由，聚合后注册到 gateway。
5. **前端外壳不硬编码插件路由**：导航由插件注册表动态生成。

---

# 第六部分：重开对话时的最小上下文

如果重开对话，只需提供以下信息即可继续：

1. **本文档**（描述项目全局和已完成部分）。
2. **当前任务的代码**（如阶段四的 gateway 实现）。
3. **如果涉及现有模块**：对应的接口文件（如 `core/plugin-host/src/types.ts`、`shared/message-bus/interface.ts`）。

我就能接着往下干。

**重开对话时的标准问法：**

> 这是 SP3.md，项目阶段一、二、三已完成，现在进入阶段四。请阅读 SP3.md，然后从阶段四的 [具体任务] 开始，逐文件输出。

**如果继续阶段四，第一批建议从这些文件开始：**

1. `core/plugin-host/src/types.ts` 加 `bus` 字段
2. `core/plugin-host/src/host.ts` 的 `PluginHostOptions` 加 `bus`，`buildContext` 注入
3. `plugins/geofence/src/index.js` 的 `onLoad` 里调 `setBus(ctx.bus)`
4. `plugins/anomaly/src/index.js` 的 `onLoad` 里调 `setBus(ctx.bus)`
5. `tests/pluginHost.host.test.ts` 更新
6. `tests/integration.alertFlow.test.ts` 改成走 PluginHost 分发
7. `core/gateway/` 新建
8. `web/` 新建

---

**文档版本：** SP3
**对应阶段：** 阶段一、二、三完成，阶段四未开始
**最后更新：** 阶段三完成时