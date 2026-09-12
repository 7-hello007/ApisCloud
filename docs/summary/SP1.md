# ApisCloud - 蜂云 项目进度文档

> 本文档记录项目总目标、阶段规划、已完成部分、踩坑记录、文件清单。重开对话时，读此文档即可继续干活。

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
| 2.5 | 编写 simulator 测试 | 单元测试：状态机、车辆数量 | simulator.stateMachine.test.js |
| 2.6 | 编写 ingest 测试 | 单元测试：MQTT 转总线、下行命令 | ingest.mqttToBus.test.js |
| 2.7 | 编写 data-writer 测试 | 单元测试：PG 插入、Upsert | dataWriter.pgInsert.test.js |
| 2.8 | 编写消息总线测试 | 单元测试：各适配器、切换 | messageBus.*.test.js |
| 2.9 | 编写集成测试 | MQTT → 消息总线 → PG 全链路 | integration.mqttToPg.test.js |
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
| 3.7 | 编写调度算法测试 | 每个算法的单元测试 | dispatch.*.test.js |
| 3.8 | 编写 geofence 测试 | 单元测试：围栏检测、边界 | geofence.zoneDetection.test.js |
| 3.9 | 编写 anomaly 测试 | 单元测试：速度、电量阈值 | anomaly.speedThreshold.test.js |
| 3.10 | 编写集成测试 | 调度流、告警流 | integration.dispatchFlow.test.js |
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
| 4.8 | 编写 plugin-host 测试 | 加载、异常隔离 | pluginHost.*.test.js |
| 4.9 | 编写层配置测试 | 加层、减层、层顺序 | layerConfig.addLayer.test.js |
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
| 5.11 | 验证消息总线切换 | Kafka → Memory | messageBus.switch.test.js |
| 5.12 | 验证层扩展 | 单层 → 多层 | layerConfig.addLayer.test.js |
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
| 6.1 | 补全单元测试 | 覆盖所有核心逻辑 | tests/*.test.js |
| 6.2 | 补全集成测试 | 覆盖关键链路 | integration.*.test.js |
| 6.3 | 补全端到端测试 | 覆盖完整数据流 | e2e.*.test.js |
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

# 第二部分：已完成部分

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

- `docker-compose.infra.yml` 编排 7 个服务，全部带 healthcheck。
- `deploy/postgres/init.sql` 建 4 张表 + 1 视图。
- `deploy/redis/redis.conf`、`deploy/emqx/emqx.conf` 提供自定义配置。
- `monitor/prometheus/prometheus.yml`、`monitor/loki/loki-config.yml`、`monitor/grafana/provisioning/` 提供监控配置。
- Makefile 加 5 个基础设施命令。

**4 张表：**

| 表 | 用途 |
|---|---|
| `vehicle_latest` | 车辆最新状态（O(1) 读） |
| `vehicle_telemetry` | 车辆遥测（时序） |
| `alerts` | 告警 |
| `dispatch_commands` | 调度指令审计 |

### 1.3 共享库 `core/libs`

**怎么完成：**

- 8 个子模块：config、logger、health、pg、redis、mqtt、metrics、security。
- config 用 dotenv + zod，启动时校验，缺关键字段直接失败。
- logger 用 pino，JSON 格式，字段含 `trace_id`、`span_id`、`service`、`plugin`、`layer`。
- health 注册式，各服务注册检查项，聚合 `ok/degraded/down`。
- pg 用 `pg.Pool`，封装 query、transaction、health。
- redis 用 ioredis，封装 get/set/hset/hgetall/publish/subscribe。
- mqtt 用 mqtt.js，测试环境 `manualConnect`。
- metrics 用 prom-client，counter/gauge/histogram，默认标签 `service`。
- security 在 1.12 里扩展为 9 个子模块。

### 1.4 消息总线抽象层 `shared/message-bus`

**怎么完成：**

- `interface.ts` 定义 `MessageBus` 统一接口（connect/publish/subscribe/commit/health/close）。
- `envelope.ts` 定义统一消息信封，zod 校验，未提供 `trace_id`/`span_id` 时自动生成。
- `topics.ts` 定义 4 个主题：`telemetry.raw`、`telemetry.aggregated`、`events.commands`、`events.alerts`。
- 3 个适配器：memory、mqtt、kafka。
- `factory.ts` 按 `MESSAGE_BUS` 配置创建实例。
- MQTT 适配器测试环境用 `manualConnect` + `reconnectPeriod: 0`，`close()` 用 try/catch 兜底。

### 1.5 层配置 `shared/layer-config`

**怎么完成：**

- `layers.yml` 声明单层结构，10 个核心服务，注释预留三层/四层。
- `schema.ts` 用 zod 校验，`KNOWN_SERVICES` 白名单，层名正则。
- `loader.ts` 提供 `loadLayers`、`getLayer`、`getServices`、`getLayerNames`、`isServiceEnabled`。
- `package.json` 的 build 脚本复制 `layers.yml` 到 dist。

### 1.6 插件宿主 `core/plugin-host`

**怎么完成：**

- 8 个模块：types、schema、guard、loader、registry、lifecycle、host、index。
- `Plugin` 接口含 6 个可选钩子：onLoad、onUnload、onMessage、onTimer、getRoutes、getHealth。
- `PluginHost` 公开 8 个方法：register、loadAll、unloadAll、dispatchMessage、dispatchTimer、getRoutes、health、getRegistry。
- 基础保护：异常隔离（每个回调 try/catch）、超时控制（onLoad 5s、onMessage 1s 等）。
- 模板插件 `plugins/_template/` 复制即用。

### 1.7 可观测性服务 `core/services/observability`

**怎么完成：**

- 8 个模块：types、metrics、health、logger、tracing、server、service、server-entry。
- 三层指标 + 总线指标，共 9 个。
- 两个端点：`/metrics`（Prometheus）+ `/health`（JSON）。
- `Tracer` 类为 OpenTelemetry 预留，日志字段已含 `trace_id`、`span_id`。
- 支持独立启动（`node dist/server-entry.js`）和内嵌使用（`createObservabilityService`）。

### 1.8 CI 配置 `.github/workflows/`

**怎么完成：**

- `ci.yml`：5 个并行 job（lint、typecheck、test-unit、build、registry-check）+ 1 个汇总 job。
- `security.yml`：gitleaks + pnpm audit，每周一自动跑。
- `dependabot.yml`：3 个生态，按类型分组。
- `PULL_REQUEST_TEMPLATE.md`、`bug_report.md`。
- `.gitleaks.toml` 白名单避免误报。

### 1.9 建立 registry `scripts/`

**怎么完成：**

- `scripts/lib/scanner.js`：遍历目录找 `plugin.json`，跳过 `_` 和 `.` 开头目录。
- `scripts/lib/validator.js`：手动校验 manifest 字段，补默认值。
- `scripts/lib/topo.js`：Kahn 算法拓扑排序，稳定输出，检测循环依赖。
- `scripts/lib/profiles.js`：profile → 插件名列表，加 `all` 伪 profile。
- `scripts/build-registry.js`：导出 `buildRegistry`，CLI 和单测共用。
- 10 个核心服务 `plugin.json` + 1 个示例插件。

### 1.10 建立 docs `docs/`

**怎么完成：**

- 8 个阶段一功能文档 + `docs/README.md`。
- 每篇按「功能目标 / 基础实现 / V1 修改 / 后续版本」结构。

### 1.11 建立 tests `tests/`

**怎么完成：**

- 扁平结构，命名规范 `功能名.（附加说明）.test.ts`。
- 前缀区分层级：无前缀=单元，`integration.`=集成，`e2e.`=端到端。
- 测试辅助：`tests/helpers/` 提供 makeEnvelope、makePlugin、waitFor。
- `tests/setup.js`：环境变量、超时、mock 清理、日志屏蔽。
- `jest.config.js`：覆盖率阈值、排除规则、moduleNameMapper。
- Makefile 7 个测试命令：test、test-unit、test-integration、test-e2e、test-coverage、test-watch、test-file。

### 1.12 编写安全基础 `core/libs/src/security/`

**怎么完成：**

- 9 个子模块：constants、jwt、auth、validation、secrets、command-signature、rate-limiter、replay-guard、index。
- JWT 用 HS256，访问 token 1h，refresh 7d。
- 认证中间件兼容原生 http（`guard`）和 Express 风格（`expressMiddleware`）。
- 10 个常用 schema：SafeString、SafeName、VehicleId、TaskId、Latitude、Longitude、Position、Battery、TimeWindow、Priority、EnvelopeSchema。
- 指令签名：HMAC-SHA256 + canonicalize + timingSafeEqual + 时间窗。
- 限流器和防重放：时间源可注入，便于测试；当前内存版，多实例部署时替换为 Redis 版。

### 1.13 编写文档

阶段一 8 个计划书列出的文档全部就位，加上 1.12 重写的 `security.V1.md`。

**建议补：** `docs/testing.V1.md`、`docs/registry.V1.md`（阶段一完成时未写，可选）。

## 已完成部分汇总

| 子任务 | 状态 | 主要产出 |
|---|---|---|
| 工程初始化 | ✅ | monorepo 骨架、TS/ESLint/Prettier/Jest 配置、Makefile |
| 1.1 基础设施编排 | ✅ | `docker-compose.infra.yml`，7 个服务 |
| 1.2 数据库初始化 | ✅ | `deploy/postgres/init.sql`，4 表 + 1 视图 |
| 1.3 共享库 | ✅ | `core/libs/`，8 个模块 |
| 1.4 消息总线 | ✅ | `shared/message-bus/`，3 个适配器 |
| 1.5 层配置 | ✅ | `shared/layer-config/`，5 个查询函数 |
| 1.6 插件宿主 | ✅ | `core/plugin-host/`，8 个模块 |
| 1.7 可观测性 | ✅ | `core/services/observability/`，9 个指标 + 2 个端点 |
| 1.8 CI 配置 | ✅ | `.github/` 完整 |
| 1.9 registry | ✅ | `scripts/lib/` 4 个模块 + `buildRegistry` |
| 1.10 docs | ✅ | 9 个文档 |
| 1.11 tests | ✅ | 23 个 suite、142 个测试全绿 |
| 1.12 安全基础 | ✅ | `core/libs/src/security/`，9 个模块 |
| 1.13 文档 | ✅ | 阶段一 8 个文档全部就位 |

## 还没完成的部分

| 阶段 | 状态 | 未完成内容 |
|---|---|---|
| 阶段一 | ✅ 已完成 | 无（可选：补 testing.V1.md、registry.V1.md） |
| 阶段二 | ⬜ 未开始 | simulator、ingest、data-writer、集成测试 |
| 阶段三 | ⬜ 未开始 | dispatch-core、3 个调度算法插件、geofence、anomaly |
| 阶段四 | ⬜ 未开始 | gateway、前端外壳、dashboard、前端插件加载器 |
| 阶段五 | ⬜ 未开始 | 插件生态、消息总线性能优化 |
| 阶段六 | ⬜ 未开始 | 测试完善、可观测性完善、安全完善、部署、交付 |

---

# 第三部分：阶段一踩过的坑

## 1. 工程初始化阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | TS 报"找不到任何输入" | `include: ["src/**/*"]` 匹配不到文件，因为 `src/index.ts` 未建 | 每个子包补上 `index.ts` |
| 2 | TS 报 `baseUrl`、`moduleResolution=node10` 弃用 | TS 5.9 对旧解析选项发弃用警告 | `ignoreDeprecations: "5.0"`（TS 5.9 接受 `5.0`，不接受 `6.0`） |
| 3 | `@apiscloud/plugin-host` 找不到 | `paths` 只列了 5 个包，漏了它 | 在 `tsconfig.base.json` 的 `paths` 补上 |
| 4 | `describe`/`it`/`expect` 未定义 | tsconfig 没加 `types` | `types: ["node", "jest"]` |
| 5 | CLI 报 TS5103 `ignoreDeprecations` 非法值 | TS 5.9 只接受 `"5.0"` | 删掉或改 `"5.0"` |
| 6 | Jest 报 `Unexpected token 'export'` | `tsc -b` 输出 ESM，Jest 按 CJS 加载 | `module` 改回 `CommonJS`，清 dist 重编 |
| 7 | ESLint 警告 TS 5.9 不被支持 | `@typescript-eslint` 7.x 只支持 TS < 5.6 | 升级到 `@typescript-eslint` 8.x |
| 8 | `make build-registry` 报 MODULE_NOT_FOUND | `scripts/build-registry.js` 未创建 | 创建该文件 |

## 2. 基础设施阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | EMQX 1883 端口转发失败 | 端口被占用或 Docker 转发异常 | 改为 11883 |
| 2 | Grafana 3000 端口转发失败 | 同上 | 改为 13000 |

## 3. 共享库阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | metrics 测试断言不匹配 | prom-client 的 `setDefaultLabels` 会给所有指标加 `service` 标签 | 断言改成 `test_gauge{service="test-svc"} 42` |
| 2 | dotenv 17.x 输出噪声 | dotenv 默认打印提示 | `dotenv.config({ quiet: true })` |

## 4. 消息总线阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | 跨项目 rootDir 报错 | TS6059/TS6307：message-bus 引用了 libs 但没在 `references` 里声明 | `shared/message-bus/tsconfig.json` 加 `references: [{ path: "../../core/libs" }]` |
| 2 | message-bus 找不到 zod | 没装 | `pnpm add zod` |
| 3 | `moduleResolution: "bundler"` 冲突 | `bundler` 要求 `module` 是 `es2015+`，项目用 CommonJS | 删掉 `bundler`，继承 base 的 `Node10` |
| 4 | 循环引用 | 某个子包的 `references` 方向错 | 检查所有子包的 references 方向，确保 DAG |

## 5. 插件宿主阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | tsbuildinfo 路径冲突 | VS Code 和 CLI 抢同一个文件 | `tsconfig.base.json` 加 `tsBuildInfoFile: "dist/.tsbuildinfo"` |
| 2 | 项目引用循环 | references 方向错 | 逐个检查，`core/libs` 无 references，`message-bus` 只引用 `core/libs` |

## 6. 可观测性阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | TS6196 `MetricsRegistry` 未使用 | server.ts 引了没用 | 删掉这个导入 |
| 2 | `trace_id` / `span_id` 类型不匹配 | `newTraceContext` 返回 `LogContext`，字段 optional | 明确返回 `TracingContext`，字段必填 |
| 3 | `@apiscloud/observability` 找不到 | jest 和 tsconfig 都没加映射 | 两处都加 |
| 4 | MQTT 客户端泄漏 | 测试跑完还在重连 | `manualConnect: config.NODE_ENV === 'test'` + `reconnectPeriod: 0` |
| 5 | `svc.port()` 调用错误 | 接口里 `port` 是属性不是方法 | 改成 `svc.port` |
| 6 | `TracingContext` 不能赋给 `LogContext` | 前者缺 index signature | 加 `[key: string]: unknown` |
| 7 | MQTT `close()` 报 undefined | 未连接时 `client.end()` 访问 undefined stream | try/catch 包住，100ms 超时兜底 |
| 8 | dotenv 输出噪声 | 同共享库 | `dotenv.config({ quiet: true })` |

## 7. registry 阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | 插件名重复时报"循环依赖" | 重名检查在拓扑排序之后 | 把重名检查移到拓扑排序之前 |

## 8. tests 阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | Makefile 找不到 `jest` | pnpm 把 jest 放在 `node_modules/.bin/`，不在系统 PATH | 改用 `pnpm exec jest` |
| 2 | 过滤条件无匹配时 Jest 报错 | Jest 默认返回退出码 1 | `--passWithNoTests` |

## 9. 安全基础阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | `SecurityContext` 找不到 | 重命名为 `LegacySecurityContext`，顶层出口未同步 | 顶层改成 `export * from './security'` |
| 2 | 未使用的导入 | `import type` 和 `export type ... from` 重复 | 删掉顶部的 `import type` |
| 3 | 新安全函数引不到 | `core/libs/src/index.ts` 只导出了 `createSecurity` | 改成 `export * from './security'` |
| 4 | 密钥校验顺序错 | 默认值长度 23 < 32，先被长度检查拦下 | 默认值检查移到长度检查之前 |

## 关键教训汇总

1. **monorepo 的 `references` 必须严格单向**，任何反向引用都会形成环。
2. **模块内部完整导出 ≠ 包顶层完整 re-export**，两个 `index.ts` 都要检查。
3. **TS 版本和 ESLint 版本要匹配**。TS 5.9 配 `@typescript-eslint` 8.x。
4. **`ignoreDeprecations` 版本敏感**。TS 5.9 用 `"5.0"`，TS 6.x 用 `"6.0"`。
5. **Makefile 里调 npm 工具要用 `pnpm exec`**。
6. **MQTT 客户端在测试环境要 `manualConnect`**。
7. **zod 不支持数组元素唯一性**，要手动校验。
8. **检查顺序按危险程度排**。默认值比长度更危险，先拦截。
9. **prom-client 的 `setDefaultLabels` 会给所有指标加标签**。
10. **CLI 是权威**。`pnpm typecheck`、`pnpm test:unit` 全绿就是验收标准，VS Code 的差异不作为阻塞。

---

# 第四部分：项目文件清单

## 根目录

```
ApisCloud/
├── package.json                  — monorepo 根配置，脚本入口
├── pnpm-workspace.yaml           — workspace 包路径声明
├── pnpm-lock.yaml                — 依赖锁文件（进 Git）
├── tsconfig.base.json            — TS 共享配置，含 paths 和 tsBuildInfoFile
├── tsconfig.json                 — 根项目引用，列出 7 个子包
├── jest.config.js                — Jest 全局配置
├── .eslintrc.json                — ESLint 配置
├── .eslintignore                 — ESLint 排除
├── .prettierrc                   — Prettier 配置
├── .prettierignore               — Prettier 排除，含 .github/ 和 *.md
├── .editorconfig                 — 编辑器统一配置
├── .gitignore                    — Git 排除，含 dist、node_modules、.env、coverage、registry.json
├── .gitleaks.toml                — 密钥扫描白名单
├── .env.example                  — 环境变量模板（进 Git）
├── .env                          — 本地环境变量（不进 Git）
├── Makefile                      — 统一命令入口
├── docker-compose.infra.yml      — 基础设施编排
├── README.md                     — 项目说明 + CI 徽章 + 文档链接
```

## `core/libs/` — 共享库

```
core/libs/
├── package.json                  — @apiscloud/libs
├── tsconfig.json                 — 无 references，最底层
└── src/
    ├── index.ts                  — 统一出口，含 export * from './security'
    ├── config/
    │   ├── schema.ts             — zod schema，环境变量契约
    │   └── index.ts              — loadConfig、resetConfig、缓存
    ├── logger/
    │   ├── types.ts              — LogContext、LoggerOptions
    │   └── index.ts              — createLogger、withContext
    ├── health/
    │   ├── types.ts              — HealthState、HealthCheckResult、HealthReport
    │   └── index.ts              — HealthRegistry、createHealthRegistry
    ├── pg/index.ts               — createPg，Pool + query + transaction + health
    ├── redis/index.ts            — createRedis，ioredis 封装
    ├── mqtt/index.ts             — createMqtt，测试环境 manualConnect
    ├── metrics/index.ts          — createMetrics，prom-client 封装
    └── security/
        ├── constants.ts          — JWT 算法、过期时间、签名算法、限流参数
        ├── jwt.ts                — createJwt，sign/signRefresh/verify/decode
        ├── auth.ts               — createAuthMiddleware，guard + expressMiddleware
        ├── validation.ts         — createValidation + 10 个常用 schema
        ├── secrets.ts            — createSecrets，requireStrongJwtSecret
        ├── command-signature.ts  — createCommandSignature，HMAC-SHA256
        ├── rate-limiter.ts       — createRateLimiter，可注入时间源
        ├── replay-guard.ts       — createReplayGuard，nonce + 时间窗
        └── index.ts              — 统一出口 + 兼容旧 createSecurity
```

## `core/plugin-host/` — 插件宿主

```
core/plugin-host/
├── package.json                  — @apiscloud/plugin-host
├── tsconfig.json                 — references: [core/libs, shared/message-bus]
└── src/
    ├── types.ts                  — Plugin、PluginContext、PluginManifest、LoadedPlugin
    ├── schema.ts                 — PluginManifestSchema，zod 校验 plugin.json
    ├── guard.ts                  — withTimeout、safeCall
    ├── loader.ts                 — readManifest、resolveEntry、loadPluginInstance
    ├── registry.ts               — PluginRegistry，按名/profile/core 过滤
    ├── lifecycle.ts              — LifecycleManager，onLoad/onUnload
    ├── host.ts                   — PluginHost，8 个公开方法
    └── index.ts                  — 统一出口
```

## `core/services/observability/` — 可观测性服务

```
core/services/observability/
├── package.json                  — @apiscloud/observability
├── tsconfig.json                 — references: [core/libs]
└── src/
    ├── types.ts                  — ObservabilityOptions、TracingContext 等
    ├── metrics.ts                — createObservabilityMetrics，9 个指标
    ├── health.ts                 — createObservabilityHealth
    ├── logger.ts                 — createObservabilityLogger、withTrace、newTraceContext
    ├── tracing.ts                — Tracer，startSpan/endSpan/activeSpans
    ├── server.ts                 — createServer，/metrics + /health
    ├── service.ts                — createObservabilityService，组合所有
    ├── index.ts                  — 统一出口
    └── server-entry.ts           — 独立进程入口，SIGTERM/SIGINT
```

## `core/services/` — 其他核心服务的占位

```
core/services/
├── infra/plugin.json             — 核心服务 manifest
├── gateway/plugin.json
├── plugin-host/plugin.json
├── libs/plugin.json
├── ingest/plugin.json
├── data-writer/plugin.json
├── simulator/plugin.json
├── dispatch-core/plugin.json
├── registry/plugin.json
└── observability/                — 已有完整实现
```

**注意：** 除 observability 外，其他目录只有 `plugin.json`，阶段二三四会填实现。

## `core/registry/` — 注册表

```
core/registry/
├── .gitkeep                      — 占位
└── registry.json                 — 生成产物（不进 Git）
```

## `shared/message-bus/` — 消息总线

```
shared/message-bus/
├── package.json                  — @apiscloud/message-bus
├── tsconfig.json                 — references: [core/libs]
├── interface.ts                  — MessageBus 统一接口
├── envelope.ts                   — Envelope + createEnvelope/validateEnvelope
├── topics.ts                     — TOPICS 常量（4 个主题）
├── factory.ts                    — createMessageBus
├── index.ts                      — 统一出口
└── adapters/
    ├── memory.ts                 — MemoryAdapter
    ├── mqtt.ts                   — MqttAdapter
    └── kafka.ts                  — KafkaAdapter
```

## `shared/types/` — 共享类型

```
shared/types/
├── package.json                  — @apiscloud/types
├── tsconfig.json
└── index.ts                      — HealthStatus
```

## `shared/contracts/` — 共享契约

```
shared/contracts/
├── package.json                  — @apiscloud/contracts
├── tsconfig.json
└── index.ts                      — Envelope 接口
```

## `shared/layer-config/` — 层配置

```
shared/layer-config/
├── package.json                  — @apiscloud/layer-config，build 脚本复制 layers.yml
├── tsconfig.json                 — references: [core/libs]
├── layers.yml                    — 层配置（单层 + 注释预留多层）
├── schema.ts                     — LayersConfigSchema、KNOWN_SERVICES
├── loader.ts                     — loadLayers、getLayer、getServices 等
└── index.ts                      — 统一出口
```

## `plugins/` — 插件目录

```
plugins/
├── _template/                    — 模板插件（扫描时跳过）
│   ├── plugin.json
│   └── src/index.js
└── example-plugin/               — 示例插件
    ├── plugin.json
    └── src/index.js
```

## `scripts/` — 构建脚本

```
scripts/
├── build-registry.js             — 主入口，导出 buildRegistry
└── lib/
    ├── scanner.js                — 遍历目录找 plugin.json
    ├── validator.js              — 校验 manifest
    ├── topo.js                   — 拓扑排序
    └── profiles.js               — profile 索引
```

## `tests/` — 测试目录（扁平）

```
tests/
├── README.md                     — 测试规范
├── setup.js                      — 全局设置
├── helpers/
│   ├── index.ts                  — 统一出口
│   ├── envelope.ts               — makeEnvelope
│   ├── plugin.ts                 — makePlugin、makePluginInstance
│   └── wait.ts                   — waitFor、delay
├── smoke.init.test.ts            — 冒烟测试
├── helpers.test.ts               — 辅助函数测试
├── libs.config.test.ts
├── libs.health.test.ts
├── libs.metrics.test.ts
├── libs.security.test.ts
├── messageBus.envelope.test.ts
├── messageBus.memory.test.ts
├── messageBus.switch.test.ts
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
└── security.secrets.test.ts
```

## `docs/` — 文档

```
docs/
├── README.md                     — 文档索引 + 命名规范 + 写作模板
├── architecture.V1.md            — 系统架构总览
├── infra.V1.md                   — 基础设施编排
├── messageBus.V1.md              — 消息总线抽象层
├── layerConfig.V1.md             — 层配置
├── pluginHost.V1.md              — 插件宿主
├── observability.V1.md           — 可观测性服务
├── security.V1.md                — 安全基础
└── cicd.V1.md                    — CI/CD 配置
```

## `deploy/` — 部署配置

```
deploy/
├── postgres/init.sql             — 数据库初始化
├── redis/redis.conf              — Redis 配置
└── emqx/emqx.conf                — EMQX 配置
```

## `monitor/` — 监控配置

```
monitor/
├── prometheus/prometheus.yml     — 抓取配置
├── loki/loki-config.yml          — Loki 配置
└── grafana/
    ├── provisioning/
    │   ├── datasources/datasources.yml
    │   └── dashboards/dashboards.yml
    └── dashboards/               — 面板 JSON（待补）
```

## `.github/` — GitHub 配置

```
.github/
├── workflows/
│   ├── ci.yml                    — 主 CI 流水线
│   └── security.yml              — 安全扫描
├── ISSUE_TEMPLATE/
│   └── bug_report.md             — Bug 报告模板
├── PULL_REQUEST_TEMPLATE.md      — PR 模板
└── dependabot.yml                — 依赖更新
```

## `web/` — 前端外壳（待阶段四）

```
web/
└── .gitkeep
```

## `deploy/` — 部署（待阶段六）

```
deploy/
├── single-layer/.gitkeep
└── multi-layer/.gitkeep
```

---

# 第五部分：当前状态与下一步

## 当前命令验证

```bash
make typecheck      # ✅ 通过
make lint           # ✅ 通过
make test-unit      # ✅ 23 个 suite、142 个测试全绿
make test-coverage  # ✅ 生成覆盖率报告
make build          # ✅ 全部构建成功
make infra-up       # ✅ 7 个服务 healthy
make build-registry # ✅ 生成 registry.json
make registry-check # ✅ registry 校验通过
```

## 阶段一验收清单

- [x] 基础设施可一键启动
- [x] 共享库可被引用
- [x] 消息总线可切换
- [x] 层配置可加载
- [x] 插件宿主可加载插件
- [x] 可观测性可用
- [x] CI 可运行
- [x] 安全基础就位
- [x] 文档完整
- [x] 测试规范完整

## 下一步：阶段二

**阶段目标：** 打通"数据进来 → 数据存下"的主干道。

**要做的三件事：**

### 1. 开发 simulator（`core/services/simulator/`）

- 状态机 + GPS 生成器
- 500 辆模拟车辆
- 按 MQTT 协议上报
- 输出：`core/services/simulator/src/`

### 2. 开发 ingest（`core/services/ingest/`）

- 唯一外部出入口
- 订阅 MQTT，转发消息总线
- 订阅总线，下发 MQTT
- 输出：`core/services/ingest/src/`

### 3. 开发 data-writer（`core/services/data-writer/`）

- 唯一写库者
- 消费消息总线
- 写 PG（`vehicle_latest`、`vehicle_telemetry`、`alerts`）
- 写 Redis（热路径）
- 输出：`core/services/data-writer/src/`

**能直接开工的前提：**

1. 基础设施已启动：`make infra-up`
2. 共享库可用：`import { createLogger, createPg, createRedis, createMqtt, createMetrics, createHealthRegistry, loadConfig } from '@apiscloud/libs'`
3. 消息总线可用：`import { createMessageBus, createEnvelope, TOPICS } from '@apiscloud/message-bus'`
4. 层配置可用：`import { loadLayers, getServices } from '@apiscloud/layer-config'`
5. 插件宿主可用：`import { PluginHost, loadPlugin } from '@apiscloud/plugin-host'`
6. 可观测性可用：`import { createObservabilityService } from '@apiscloud/observability'`

## 阶段二的依赖关系

```
simulator ──→ MQTT ──→ ingest ──→ 消息总线 ──→ data-writer ──→ PG/Redis
                ↓                                   ↑
            外部系统                          消息总线（可切换）
```

**核心规则：**

- 只有 Ingest 连外部（MQTT）
- 只有 Data-Writer 连库（PG/Redis）
- 服务之间零直接调用，只通过消息总线
- 所有服务用 `@apiscloud/libs` 的统一封装，不直接引 SDK

## 阶段二开工清单

当你给出阶段二的代码时，按以下顺序检查：

1. **`core/services/simulator/package.json`** 是否正确引用 `@apiscloud/libs`、`@apiscloud/message-bus`。
2. **`core/services/simulator/tsconfig.json`** 的 `references` 是否指向正确的依赖。
3. **根 `tsconfig.json`** 的 `references` 是否加入新服务。
4. **`jest.config.js`** 的 `moduleNameMapper` 是否加入新包。
5. **`tsconfig.base.json`** 的 `paths` 是否加入新包。
6. **`plugin.json`** 的 `topics.subscribe` 和 `topics.publish` 是否声明正确。
7. **测试文件** 命名是否符合规范（无前缀=单元，`integration.`=集成）。
8. **文档** 是否按 `功能名.V1.md` 命名。

## 重开对话时的最小上下文

如果重开对话，只需提供以下信息即可继续：

1. **本文档**（描述项目全局）。
2. **当前任务的代码**（如阶段二的 simulator 实现）。
3. **`package.json`、`tsconfig.base.json`、`jest.config.js`** 三个关键配置。

我就能接着往下干。

---

**文档版本：** V1  
**对应阶段：** 阶段一完成，阶段二未开始  
**最后更新：** 阶段一完成时