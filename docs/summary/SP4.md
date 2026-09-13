# ApisCloud - 蜂云 项目进度文档 SP4

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

# 第二部分：已完成部分（阶段一、二、三、四）

## 阶段一：基础设施与共享库 ✅ 已完成

阶段一全部 13 项任务已完成。实际执行时，在原计划前额外做了一步**工程初始化**（monorepo 骨架），然后依次完成 1.1 到 1.13。

### 1.0 工程初始化

**怎么完成：**

- 建 monorepo：`pnpm-workspace.yaml` 声明包路径。
- 统一 TS：`tsconfig.base.json` + 子包 `tsconfig.json`（project references 建 DAG）。
- 统一规范：ESLint 8、@typescript-eslint 8、Prettier 3、EditorConfig。
- 统一测试：Jest 29 + ts-jest。
- 统一命令：Makefile。
- 环境变量：`.env.example` + `.env`。

**关键设计：**

- 子包全部输出 CommonJS，Jest 可直接 require。
- `tsBuildInfoFile: "dist/.tsbuildinfo"` 避免 VS Code 和 CLI 抢文件。
- project references 严格单向，形成 DAG。

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
- `interface.ts`：`MessageBus` 统一接口。
- 3 个适配器：MemoryAdapter、MqttAdapter、KafkaAdapter。
- `factory.ts`：按 `MESSAGE_BUS` 创建实例，用 `never` 做 exhaustive 检查。

### 1.5 层配置 `shared/layer-config`

**怎么完成：**

- `layers.yml`：单层 `single`，10 个核心服务。
- `schema.ts`：zod 校验，`KNOWN_SERVICES` 白名单。
- `loader.ts`：`loadLayers`、`getLayer`、`getServices` 等 5 个查询函数。
- build 脚本把 `layers.yml` 复制到 dist。

### 1.6 插件宿主 `core/plugin-host`

**怎么完成：**

- 8 个模块：types、schema、guard、loader、registry、lifecycle、host、index。
- `Plugin` 接口 6 个可选钩子。
- `PluginHost` 8 个公开方法。
- 保护：异常隔离、超时控制。
- 模板插件 `plugins/_template/`。

### 1.7 可观测性服务 `core/services/observability`

**怎么完成：**

- 9 个指标。
- 两个端点：`/metrics`、`/health`。
- 日志统一 pino JSON。
- `Tracer` 类为 OpenTelemetry 预留。

### 1.8 CI 配置 `.github/workflows/`

**怎么完成：**

- `ci.yml`：5 个并行 job + 1 个汇总。
- `security.yml`：gitleaks + pnpm audit。
- `dependabot.yml`：3 个生态。
- PR 模板、Issue 模板、`.gitleaks.toml`。

### 1.9 registry `scripts/`

**怎么完成：**

- `scripts/lib/scanner.js`：扫描 `plugin.json`，跳过 `_`、`.` 开头。
- `scripts/lib/validator.js`：校验 manifest，补默认值。
- `scripts/lib/topo.js`：Kahn 算法拓扑排序。
- `scripts/lib/profiles.js`：profile → 插件名列表。
- `scripts/build-registry.js`：导出 `buildRegistry`。

### 1.10 docs、1.11 tests、1.12 安全基础、1.13 文档

**docs：** `docs/README.md` + 8 个阶段一功能文档。

**tests：** 扁平结构，命名 `功能名.（附加说明）.test.ts`。

**安全基础：** 9 个子模块，JWT HS256、认证中间件、10 个常用 schema、指令签名、限流、防重放。

---

## 阶段二：核心数据流服务 ✅ 已完成

### 2.0 根配置改动

**怎么完成：**

- `tsconfig.base.json` 加 3 组 paths。
- 根 `tsconfig.json` 加 3 个 references。
- `jest.config.js` 加 6 条 `moduleNameMapper` + 3 条 `collectCoverageFrom`。
- `.env` 加 `SIMULATOR_PORT=9107`。
- `prometheus.yml` 加 simulator target。
- `.eslintrc.json` 忽略 `_` 前缀未使用变量。
- Makefile 加 `init-topics`。
- 根 `package.json` 加 `kafkajs`。

### 2.1 simulator `core/services/simulator/`

**怎么完成：**

- 模拟外部自动驾驶系统，500 辆车状态，MQTT 上报。
- 状态机 + GPS 生成器 + 车队管理。
- 暴露 `/metrics`、`/health`，端口 9107。
- 8 个环境变量可配。
- 状态机覆盖 5 种状态。
- 实机验证：500 辆车，1 秒间隔，25 秒 12500 条。

### 2.2 ingest `core/services/ingest/`

**怎么完成：**

- 唯一外部出入口。
- 上行：MQTT `telemetry/raw` → 校验 → Envelope → 总线 `telemetry.raw`。
- 下行：总线 `events.commands` → 校验 → MQTT `commands/{vehicle_id}`。
- 暴露 `/metrics`、`/health`，端口 9103。
- 输入校验用 zod。
- 可注入 `mqttSubscriber`、`mqttPublisher`、`bus`。
- `partitionKey = vehicle_id`。
- 消费者组 `apiscloud-ingest`。

### 2.3 data-writer `core/services/data-writer/`

**怎么完成：**

- 唯一写库者，只订阅总线，不连 MQTT。
- 订阅 3 个主题：`telemetry.raw`、`telemetry.aggregated`、`events.alerts`。
- 写 PG：`vehicle_latest` UPSERT、`vehicle_telemetry` INSERT、`alerts` INSERT。
- 写 Redis 热路径：`vehicle:{id}:latest` TTL 60s、`vehicle:{id}` hash、`vehicles:active` set、`alerts:recent` list、`region:{region}:stats` hash。
- 暴露 `/metrics`、`/health`，端口 9104。
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

### 2.8 集成测试

`tests/integration.mqttToPg.test.ts`，13 个测试。

### 2.9-2.10 文档

- `docs/simulator.V1.md`、`docs/ingest.V1.md`、`docs/dataWriter.V1.md`。
- `docs/messageBus.V2.md`、`docs/architecture.V2.md`。

---

## 阶段三：核心业务服务与调度算法 ✅ 已完成

### 3.0 根配置改动

**怎么完成：**

- `tsconfig.base.json` 加 2 条 `@apiscloud/dispatch-core` paths。
- 根 `tsconfig.json` 加 dispatch-core reference。
- `.env.example` 和 `.env` 加 dispatch 配置。
- `jest.config.js` 加 moduleNameMapper 和 collectCoverageFrom。
- `scripts/build-registry.js` 改 `pluginDirs` 为数组，支持 `[plugins/, plugins/dispatch/]`。

### 3.1 dispatch-core `core/services/dispatch-core/`

**怎么完成：**

- 14 个文件。
- 订阅 `telemetry.raw`，累积车辆注册表。
- 任务走完整调度：硬约束过滤 → 算法排序 → 构建命令 → 签名 → 发 `events.commands`。
- 算法插件从 `plugins/dispatch/*/` 加载。
- 失败/超时回退到 nearest。
- 端口 9105。
- 消费者组 `apiscloud-dispatch-core`。

### 3.2-3.4 3 个算法插件

**怎么完成：**

| 插件 | 核心逻辑 |
|---|---|
| nearest | Haversine 距离排序，score = -distance |
| batch-match | 多因素成本最小化 |
| priority-dispatch | 动态权重，distanceWeight = 0.2 + priorityNorm×0.8 |

### 3.5-3.6 geofence、anomaly 插件

**怎么完成：**

- geofence：zones.json + geofence.js（纯逻辑）+ index.js。
- anomaly：detectors.js（纯逻辑）+ index.js。
- 阶段三不接入 plugin-host，阶段四接入。

### 3.7-3.9 单元测试

- 3 个算法测试。
- geofence、anomaly 测试。

### 3.10 集成测试

- `integration.dispatchFlow.test.ts`：10 个测试。
- `integration.alertFlow.test.ts`：13 个测试。

### 3.11 文档

- 6 个 V1 文档。

---

## 阶段四：插件系统与前端外壳 ✅ 已完成

### 4.0 根配置改动

**怎么完成：**

- `tsconfig.base.json` 加 2 条 `@apiscloud/gateway` paths。
- 根 `tsconfig.json` 加 gateway reference。
- `jest.config.js` 加映射和覆盖率。
- `.env.example` / `.env` 加 gateway 配置。
- `pnpm-workspace.yaml` 加 `web`。
- `pnpm-workspace.yaml` 加 `allowBuilds: esbuild: true`。
- `.eslintignore` / `.gitignore` 加前端排除。

### 4.1 gateway `core/services/gateway/`

**怎么完成：**

- 12 个文件：index、server-entry、types、config、plugin-loader、router、proxy、server、service。
- **三种路由：** 管理端点（`/health`、`/metrics`、`/api/registry`）、反向代理（`/api/proxy/{service}/*`）、插件路由。
- **内部创建 PluginHost**，与插件同进程。
- 从 `pluginDirs` 加载插件，聚合路由。
- 订阅插件关心的主题，转发消息给插件。
- 不启动 observability 的 HTTP 服务器，避免端口冲突。
- `GatewayService.port()` 返回实际端口。
- 端口 9101。
- 消费组 `apiscloud-gateway`。

### 4.2 plugin-host 增强

**怎么完成：**

- `PluginContext` 加 `bus?`、`createEnvelope?`、`topics?`。
- `PluginHostOptions` 加 `bus?`。
- `buildContext` 注入 bus、createEnvelope、topics。
- 插件不再 `require('@apiscloud/message-bus')`，真正独立可分发。

### 4.3 geofence / anomaly 接入

**怎么完成：**

- `onLoad` 里从 `ctx.bus`、`ctx.createEnvelope`、`ctx.topics` 拿依赖。
- `_setHelpers` 保留给测试。

### 4.4 前端外壳 `web/`

**怎么完成：**

22 个文件：

- `package.json`、`vite.config.ts`、`tsconfig.json`、`tailwind.config.js`、`postcss.config.js`、`index.html`、`favicon.svg`、`.eslintrc.json`。
- `src/vite-env.d.ts`、`src/index.css`。
- `src/runtime/registry.ts`、`src/runtime/plugin-loader.ts`。
- `src/api/client.ts`。
- `src/shell/Layout.tsx`、`Sidebar.tsx`、`Topbar.tsx`、`ThemeProvider.tsx`。
- `src/App.tsx`、`src/main.tsx`。

**关键设计：**

- 独立于后端主项目，ESNext + Bundler。
- Vite 代理 `/api`、`/health`、`/metrics` 到 gateway。
- 前端插件用 `import.meta.glob` 预扫描。
- 主题用 CSS 变量 + `dark` 类。
- Topbar 每 10s 拉 gateway `/health`。

### 4.5 UI 组件 `web/src/components/ui/`

**怎么完成：**

7 个组件 + index：Button、Card、Table、Badge、Input、Select、Spinner。

纯 TailwindCSS，无 UI 库。

### 4.6 dashboard 插件 `plugins/dashboard/` + `web/src/plugins/dashboard/`

**怎么完成：**

- `plugin.json` 声明 `frontend: "dashboard"`。
- 后端空壳 `src/index.js`。
- 前端 4 个页面：Overview、Vehicles、Alerts、Commands。
- `web/src/plugins/dashboard/index.tsx` 声明 navItems 和 routes。

### 4.7 测试

**怎么完成：**

- `tests/pluginHost.busInjection.test.ts`：3 个测试。
- `tests/gateway.router.test.ts`：20 个用例。
- `tests/gateway.config.test.ts`：11 个用例。
- `tests/gateway.pluginIntegration.test.ts`：6 个测试。

### 4.8 文档

**怎么完成：**

- 5 个 V1/V2 文档：gateway.V1、pluginHost.V2、webShell.V1、dashboard.V1、layerConfig.V2。
- `docs/README.md` 更新索引。

---

## 还没完成的部分

| 阶段 | 状态 | 未完成内容 |
|---|---|---|
| 阶段一 | ✅ 已完成 | 无 |
| 阶段二 | ✅ 已完成 | 无 |
| 阶段三 | ✅ 已完成 | 无 |
| 阶段四 | ✅ 已完成 | 无 |
| 阶段五 | ⬜ 未开始 | charging-scheduler、route-optimizer、reporting、主题分层、Redis 热路径、批量消费 |
| 阶段六 | ⬜ 未开始 | 测试完善、可观测性完善、安全完善、部署、交付 |

**阶段四遗留的可选增强（非必需）：**

- dashboard 页面真实数据接入（阶段五）
- 静态文件服务（gateway 挂载 `web/dist`，阶段五）
- 鉴权 / 限流（阶段六）

---

# 第三部分：阶段四踩过的坑

## 坑 1：plugin-host.busInjection 测试的 require lint 错误

**问题：**

```
82:38 error A `require()` style import is forbidden @typescript-eslint/no-require-imports
```

**原因：** `onLoad` 回调里写了 `require('@apiscloud/message-bus')`。

**解决：** 顶部 import `createEnvelope`，不在回调里 require。

**影响文件：** `tests/pluginHost.busInjection.test.ts`。

---

## 坑 2：gateway service.ts 未使用 Route 导入

**问题：**

```
error TS6133: 'Route' is declared but its value is never read.
```

**原因：** `Route` 类型 import 了但没用。

**解决：** 删掉这行 import。

**影响文件：** `core/services/gateway/src/service.ts`。

---

## 坑 3：gateway.pluginIntegration 空接口 lint 错误

**问题：**

```
error An interface declaring no members is equivalent to its supertype
```

**原因：**

```ts
interface MockRedis extends RedisWrapper {}
```

**解决：** 删掉空接口，直接返回 `RedisWrapper`。

**影响文件：** `tests/gateway.pluginIntegration.test.ts`。

---

## 坑 4：gateway 两个 HTTP 服务器抢端口

**问题：**

- 测试 fetch 失败 `connect ECONNREFUSED 127.0.0.1`
- `/health` 返回 observability 的响应，没有 `plugin-host` 检查项
- `/api/registry` 404

**原因：** gateway 同时创建了两个 HTTP 服务器：

1. observability 自带的，监听 `options.port`。
2. gateway 自己的，也监听 `options.port`。

`port: 0` 时各拿随机端口。测试用 `observability.port` 拿到 observability 的端口，它没 `/api/registry`。

**解决：**

- gateway **不调用** `observability.start()` / `observability.stop()`，只用其 logger / metrics / addHealthTarget。
- `GatewayService` 加 `port()` 方法，返回 gateway 自己的 server 端口。
- 测试改用 `gateway.port()`。

**影响文件：** `core/services/gateway/src/service.ts`、`tests/gateway.pluginIntegration.test.ts`。

---

## 坑 5：插件 `Cannot find module '@apiscloud/message-bus'`

**问题：**

```
Cannot find module '@apiscloud/message-bus'
Require stack:
- /home/ubuntu/ApisCloud/plugins/anomaly/src/index.js
- /home/ubuntu/ApisCloud/core/plugin-host/dist/loader.js
```

**原因：** 插件是 CommonJS，`require('@apiscloud/message-bus')`，但 `plugins/` 不在 pnpm workspace 里，没有 `node_modules` 软链。

**解决：**

1. **第一次尝试：** 给 `plugins/` 加 `package.json` 让它进 workspace。这不根本。
2. **根本修复：** plugin-host 通过 `ctx` 注入 `bus`、`createEnvelope`、`topics`，插件不再 `require` 主项目包。

**为什么这是根本修复：**

- 插件本来就要独立可分发。
- 依赖应该通过 `ctx` 注入，而不是靠 npm 包解析。
- 插件不依赖主项目的 node_modules 结构。

**影响文件：** `core/plugin-host/src/types.ts`、`host.ts`、`plugins/geofence/src/index.js`、`plugins/anomaly/src/index.js`。

---

## 坑 6：Kafka `UNKNOWN_TOPIC_OR_PARTITION`

**问题：**

```
KafkaJSProtocolError: This server does not host this topic-partition
```

**原因：** Kafka 里没有 `telemetry.raw` 主题。`KAFKA_AUTO_CREATE_TOPICS_ENABLE=true` 在 KRaft 模式下没生效。

**解决：** 跑 `make init-topics` 显式创建 4 个主题。

**教训：** 每次 `make infra-up` 后，跑一次 `make init-topics`。或加到 Makefile 里自动执行。

---

## 坑 7：Card 类型冲突

**问题：**

```
error TS2430: Interface 'CardProps' incorrectly extends interface 'HTMLAttributes<HTMLDivElement>'.
Types of property 'title' are incompatible.
Type 'ReactNode' is not assignable to type 'string | undefined'.
```

**原因：** `HTMLAttributes` 自带 `title?: string`，和我们的 `title?: ReactNode` 冲突。

**解决：** 用 `Omit<HTMLAttributes<HTMLDivElement>, 'title'>` 排除原生的 `title`。

**影响文件：** `web/src/components/ui/Card.tsx`。

---

## 坑 8：深色 / 浅色切换不生效

**问题：** 点击主题切换按钮，页面颜色不变。

**原因：** 组件里硬编码了 `bg-surface-900`、`text-surface-100`。`ThemeProvider` 虽然切了 `dark` 类，但组件里没有 `dark:` / `light:` 变体，颜色不会变。

**解决：** 用 CSS 变量 + Tailwind 引用变量。

**改动：**

1. `index.css` 在 `:root` 和 `.dark` 下定义两套 `--color-surface-*`。
2. `tailwind.config.js` 的 `surface.*` 改成 `rgb(var(--color-surface-X) / <alpha-value>)`。
3. `index.html` 加内联脚本读 localStorage 设置 `dark` 类，避免首屏闪烁。

**组件代码零改动**，只改 CSS 和 Tailwind 配置。

**影响文件：** `web/src/index.css`、`web/tailwind.config.js`、`web/index.html`。

---

## 坑 9：pnpm 11 不读 package.json 的 pnpm 字段

**问题：**

```
[WARN] The "pnpm" field in package.json is no longer read by pnpm.
```

**原因：** pnpm 11 把配置从 `package.json` 迁到 `pnpm-workspace.yaml`。

**解决：** 在 `pnpm-workspace.yaml` 加：

```yaml
allowBuilds:
  esbuild: true
```

**影响文件：** `pnpm-workspace.yaml`。

---

# 第四部分：阶段四创建的文件清单

## 根配置改动

| 文件 | 改动 |
|---|---|
| `tsconfig.base.json` | 加 2 条 `@apiscloud/gateway` paths |
| `tsconfig.json`（根） | 加 gateway reference |
| `jest.config.js` | 加 gateway 映射和覆盖率 |
| `.env.example` | 加 `GATEWAY_PROFILE`、`GATEWAY_PROXY_PREFIX` |
| `.env` | 同步 |
| `pnpm-workspace.yaml` | 加 `web`，加 `allowBuilds.esbuild` |
| `.eslintignore` | 加 `web/dist`、`web/node_modules` |
| `.gitignore` | 加 `web/dist`、`web/node_modules`、`web/.vite` |

## `core/services/gateway/` — HTTP 统一入口（阶段四）

```
core/services/gateway/
├── package.json                  — @apiscloud/gateway
├── tsconfig.json                 — references 指向 libs、message-bus、observability、plugin-host
└── src/
    ├── index.ts                  — 统一出口
    ├── server-entry.ts           — 独立启动
    ├── types.ts                  — GatewayConfig、ProxiedService、PluginRouteEntry、RouteMatch
    ├── config.ts                 — loadGatewayConfig
    ├── plugin-loader.ts          — loadPluginsFromDirs
    ├── router.ts                 — matchRoute
    ├── proxy.ts                  — proxyRequest
    ├── server.ts                 — createGatewayServer
    └── service.ts                — createGatewayService
```

**功能说明：**

| 文件 | 功能 |
|---|---|
| `types.ts` | 定义 `GatewayConfig`、`ProxiedService`、`PluginRouteEntry`、`RouteMatch`、`AdminHandler`、`PluginHandler` |
| `config.ts` | 从环境变量加载配置：端口、profile、代理前缀、被代理服务、插件扫描目录 |
| `plugin-loader.ts` | 从多个目录扫描并加载插件，跳过 `_`、`.` 开头目录，单个插件加载失败不影响其他 |
| `router.ts` | 路由匹配，优先级：管理端点 > 反向代理 > 插件路由 > 404 |
| `proxy.ts` | 反向代理请求到目标服务，透传 method / headers / body |
| `server.ts` | HTTP 服务器，处理请求，匹配路由，分派 |
| `service.ts` | 服务组合：配置 + 总线 + 可观测性 + PluginHost + HTTP 服务器 + 消息桥 |
| `index.ts` | 统一出口 |
| `server-entry.ts` | 独立启动入口，SIGTERM/SIGINT 优雅关闭 |

## `core/plugin-host/` — 插件宿主（阶段四增强）

```
core/plugin-host/src/
├── types.ts                      — PluginContext 加 bus?、createEnvelope?、topics?
├── host.ts                       — PluginHostOptions 加 bus?，buildContext 注入
└── package.json                  — 加 @apiscloud/message-bus 依赖
```

**改动说明：**

| 文件 | 改动 |
|---|---|
| `types.ts` | `PluginContext` 加 `bus?`、`createEnvelope?`、`topics?` |
| `host.ts` | `PluginHostOptions` 加 `bus?`，`buildContext` 注入这三者 |
| `package.json` | 加 `@apiscloud/message-bus` |

## `plugins/geofence/`、`plugins/anomaly/` — 接入 plugin-host

```
plugins/geofence/src/index.js     — onLoad 从 ctx 拿依赖
plugins/anomaly/src/index.js      — onLoad 从 ctx 拿依赖
```

**改动说明：**

| 文件 | 改动 |
|---|---|
| `plugins/geofence/src/index.js` | 去掉 `require('@apiscloud/message-bus')`，从 `ctx.bus` / `ctx.createEnvelope` / `ctx.topics` 拿 |
| `plugins/anomaly/src/index.js` | 同上 |

## `web/` — 前端外壳（阶段四）

```
web/
├── package.json                  — @apiscloud/web
├── tsconfig.json                 — 前端 TS 配置（ESNext + Bundler）
├── vite.config.ts                — Vite 配置 + API 代理
├── tailwind.config.js            — Tailwind 主题（CSS 变量）
├── postcss.config.js             — PostCSS
├── index.html                    — HTML 入口 + 主题内联脚本
├── .eslintrc.json                — 前端 lint
├── public/
│   └── favicon.svg               — 图标
└── src/
    ├── main.tsx                  — 入口
    ├── App.tsx                   — 路由 + 插件加载
    ├── index.css                 — Tailwind 全局样式 + CSS 变量
    ├── vite-env.d.ts             — Vite 类型
    ├── runtime/
    │   ├── registry.ts           — 插件前端注册表
    │   └── plugin-loader.ts      — 插件前端加载器（import.meta.glob）
    ├── api/
    │   └── client.ts             — HTTP 客户端
    ├── shell/
    │   ├── Layout.tsx            — 布局
    │   ├── Sidebar.tsx           — 侧边栏
    │   ├── Topbar.tsx            — 顶栏
    │   └── ThemeProvider.tsx     — 主题上下文
    ├── components/ui/
    │   ├── Button.tsx            — 按钮
    │   ├── Card.tsx              — 卡片
    │   ├── Table.tsx             — 表格
    │   ├── Badge.tsx             — 徽章
    │   ├── Input.tsx             — 输入框
    │   ├── Select.tsx            — 下拉框
    │   ├── Spinner.tsx           — 加载指示器
    │   └── index.ts              — 统一出口
    └── plugins/
        └── dashboard/
            ├── index.tsx         — 前端入口，声明 navItems 和 routes
            └── pages/
                ├── Overview.tsx  — 总览
                ├── Vehicles.tsx  — 车辆
                ├── Alerts.tsx    — 告警
                └── Commands.tsx  — 指令
```

## `plugins/dashboard/` — dashboard 插件（阶段四）

```
plugins/dashboard/
├── plugin.json                   — 声明 frontend: "dashboard"
├── src/
│   └── index.js                  — 后端空壳
└── web/
    └── pages/                    — 前端代码实际在 web/src/plugins/dashboard/
```

## `tests/` — 阶段四新增测试

```
tests/
├── pluginHost.busInjection.test.ts       — 3 个测试
├── gateway.router.test.ts                — 20 个用例
├── gateway.config.test.ts                — 11 个用例
├── gateway.pluginIntegration.test.ts     — 6 个测试
├── integration.alertFlow.test.ts         — 改造为走 PluginHost
```

## `docs/` — 阶段四新增文档

```
docs/
├── gateway.V1.md                 — HTTP 统一入口
├── pluginHost.V2.md              — 插件宿主 V2（bus 注入）
├── webShell.V1.md                — 前端外壳
├── dashboard.V1.md               — 仪表板插件
├── layerConfig.V2.md             — 层配置 V2
└── README.md                     — 更新索引
```

---

# 第五部分：当前状态与下一步

## 当前命令验证

```bash
make typecheck        # ✅ 通过
make lint             # ✅ 通过，0 warning
make test-unit        # ✅ 48 个 suite，全绿
make test-integration # ✅ 4 个 suite 全绿
make build            # ✅ 全部构建成功
make infra-up         # ✅ 7 个服务 healthy
make build-registry   # ✅ 10 个服务，7 个插件
make registry-check   # ✅ 校验通过
make init-topics      # ✅ 需要 Kafka 启动才能跑

cd web
pnpm typecheck        # ✅ 通过
pnpm build            # ✅ 生成 web/dist
```

## 当前服务端口分配

| 服务 | 端口 | 状态 |
|---|---|---|
| gateway | 9101 | 阶段四 ✅ |
| plugin-host | 9102 | 阶段一（库，被 gateway 内部使用） |
| ingest | 9103 | 阶段二 ✅ |
| data-writer | 9104 | 阶段二 ✅ |
| dispatch-core | 9105 | 阶段三 ✅ |
| observability | 9106 | 阶段一（库） |
| simulator | 9107 | 阶段二 ✅ |
| web dev | 5173 | 阶段四（Vite） |

## 当前插件清单

| 插件 | profile | frontend | 说明 |
|---|---|---|---|
| nearest | core, full | null | 最近邻算法 |
| batch-match | core, full | null | 批量匹配 |
| priority-dispatch | core, full | null | 优先级调度 |
| geofence | core, full | null | 地理围栏 |
| anomaly | core, full | null | 异常检测 |
| dashboard | core, full | "dashboard" | 仪表板 |
| example-plugin | core | null | 示例 |

## 当前消息主题

| 主题 | 分区数 | 保留 | 生产者 | 消费者 |
|---|---|---|---|---|
| telemetry.raw | 6 | 6h | ingest | data-writer、dispatch-core、gateway |
| telemetry.aggregated | 3 | 72h | 待定 | data-writer |
| events.commands | 3 | 7d | dispatch-core | ingest、data-writer |
| events.alerts | 3 | 7d | geofence、anomaly | data-writer |

## 数据流（当前状态）

```
前端 (5173) ──HTTP──→ gateway (9101) ──┬──→ 管理端点
                                        ├──→ PluginHost.dispatchMessage → geofence/anomaly → events.alerts
                                        ├──→ 插件路由 → dashboard
                                        └──→ 反向代理 → ingest / data-writer / dispatch-core

simulator ──MQTT──→ EMQX ──→ ingest ──→ telemetry.raw
                                              │
                                              ├──→ data-writer → PG/Redis
                                              ├──→ dispatch-core → events.commands
                                              └──→ gateway → geofence/anomaly → events.alerts
```

## 启动流程（实机）

```bash
# 1. 启动基础设施
make infra-up
make init-topics

# 2. 构建
make build

# 3. 启动各服务（4 个终端）
node core/services/simulator/dist/server-entry.js
node core/services/ingest/dist/server-entry.js
node core/services/data-writer/dist/server-entry.js
node core/services/dispatch-core/dist/server-entry.js
node core/services/gateway/dist/server-entry.js

# 4. 启动前端（第 6 个终端）
cd web
pnpm dev
# 访问 http://localhost:5173
```

## 下一步：阶段五

**阶段目标：** 验证插件化机制，解决功能增多后的性能问题。

**要做的：**

| 序号 | 任务 | 产出 |
|---|---|---|
| 5.1 | 开发 charging-scheduler | `plugins/charging-scheduler/` |
| 5.2 | 开发 route-optimizer | `plugins/route-optimizer/` |
| 5.3 | 开发 reporting | `plugins/reporting/` |
| 5.4 | 实施主题分层 | raw/aggregated/events |
| 5.5 | 实施选择性订阅 | plugin.json 声明 filter |
| 5.6 | 实施共享消费者组 | 相似插件共享 groupId |
| 5.7 | 实施 Redis 热路径 | 最新状态、空闲列表、区域统计 |
| 5.8 | 实施批量消费 | max.poll.records 调优 |
| 5.9 | 实施按车辆分区 | 分区键 vehicle_id |
| 5.10 | 实施插件懒订阅 | plugin.json 声明 lazy |
| 5.11 | 验证消息总线切换 | Kafka → Memory |
| 5.12 | 验证层扩展 | 单层 → 多层 |
| 5.13 | 编写插件测试 | 每个插件的单元测试 |
| 5.14 | 编写性能测试 | 对比优化前后 |
| 5.15 | 编写功能文档 | 每个插件一个文档 |

**阶段五开工前必须看的关键代码：**

1. `core/plugin-host/src/host.ts`：PluginHost 的 `dispatchMessage`、`getRoutes`、`health`。
2. `core/services/gateway/src/service.ts`：gateway 如何加载插件、订阅主题、转发消息。
3. `core/services/data-writer/src/service.ts`：多主题订阅模式。
4. `plugins/geofence/src/index.js`：插件如何从 `ctx` 拿依赖。
5. `plugins/dashboard/plugin.json`：`frontend` 字段声明。
6. `shared/message-bus/topics.ts`：主题常量。
7. `shared/message-bus/interface.ts`：`SubscribeOptions` 的 `filter`、`groupId`。
8. `tests/gateway.pluginIntegration.test.ts`：PluginHost 集成测试模板。
9. `tests/pluginHost.busInjection.test.ts`：bus 注入测试模板。

**阶段五关键决策：**

1. **charging-scheduler**：订阅 `telemetry.raw`（先这样），检测低电量（< 20%），发 `events.commands`（`command_type: 'charge'`）。
2. **route-optimizer**：订阅 `telemetry.raw`，优化路线，发 `events.commands`。
3. **reporting**：从 PG 读数据（需要 data-writer 加查询端点）。
4. **主题分层**：`telemetry.raw`（原始）、`telemetry.aggregated`（聚合）、`events.*`（事件）。
5. **选择性订阅**：plugin.json 的 `topics.subscribe` 已经支持，加 `filter` 字段。
6. **共享消费者组**：相似插件用同一 `groupId`，减少扇出。
7. **Redis 热路径**：`vehicles:idle` set，插件从 Redis 读，不消费 Kafka。
8. **批量消费**：KafkaAdapter 加 `max.poll.records` 配置。
9. **按车辆分区**：已经在 ingest 里实现，插件发布时也用 `partitionKey = vehicle_id`。
10. **插件懒订阅**：plugin.json 的 `lazy` 字段已经支持，阶段五实现真正懒加载。

---

# 第六部分：重开对话时的最小上下文

如果重开对话，只需提供以下信息即可继续：

1. **本文档**（SP4.md，描述项目全局和已完成部分）。
2. **当前任务的代码**（如阶段五的 charging-scheduler 实现）。
3. **如果涉及现有模块**：对应的接口文件（如 `core/plugin-host/src/types.ts`、`shared/message-bus/interface.ts`）。

我就能接着往下干。

**重开对话时的标准问法：**

> 这是 SP4.md，项目阶段一、二、三、四已完成，现在进入阶段五。请阅读 SP4.md，然后从阶段五的 [具体任务] 开始，逐文件输出。

**如果继续阶段五，第一批建议从这些文件开始：**

1. `plugins/charging-scheduler/plugin.json`
2. `plugins/charging-scheduler/src/index.js`
3. `plugins/charging-scheduler/src/detectors.js`（纯逻辑）
4. `tests/chargingScheduler.detect.test.ts`
5. 或先做 `plugins/route-optimizer/`、`plugins/reporting/`

---

**文档版本：** SP4
**对应阶段：** 阶段一、二、三、四完成，阶段五未开始
**最后更新：** 阶段四完成时