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

---

### 阶段二：核心数据流服务

**阶段目标：** 打通"数据进来 → 数据存下"的主干道。

**实现思路：**

- simulator 产生 500 辆模拟车辆数据，通过 MQTT 上报。
- ingest 作为唯一外部出入口，订阅遥测，转发到消息总线。
- data-writer 作为唯一写库者，从消息总线消费，写入 PostgreSQL 和 Redis。
- 定义主题：telemetry.raw、telemetry.aggregated、events.commands、events.alerts。
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
- config 用 dotenv + zod，启动时校验。
- logger 用 pino，JSON 格式，字段含 `trace_id`、`span_id`、`service`、`plugin`、`layer`。
- health 注册式，聚合 `ok/degraded/down`。
- pg 用 `pg.Pool`，封装 query、transaction、health。
- redis 用 ioredis，封装 get/set/hset/hgetall/publish/subscribe。
- mqtt 用 mqtt.js，测试环境 `manualConnect`。
- metrics 用 prom-client。
- security 在 1.12 里扩展为 9 个子模块。

### 1.4 消息总线抽象层 `shared/message-bus`

**怎么完成：**

- `interface.ts` 定义 `MessageBus` 统一接口。
- `envelope.ts` 定义统一消息信封，zod 校验。
- `topics.ts` 定义 4 个主题。
- 3 个适配器：memory、mqtt、kafka。
- `factory.ts` 按 `MESSAGE_BUS` 配置创建实例。

### 1.5 层配置 `shared/layer-config`

**怎么完成：**

- `layers.yml` 声明单层结构，10 个核心服务。
- `schema.ts` 用 zod 校验，`KNOWN_SERVICES` 白名单。
- `loader.ts` 提供 `loadLayers`、`getLayer`、`getServices` 等。

### 1.6 插件宿主 `core/plugin-host`

**怎么完成：**

- 8 个模块：types、schema、guard、loader、registry、lifecycle、host、index。
- `Plugin` 接口含 6 个可选钩子。
- `PluginHost` 公开 8 个方法。
- 基础保护：异常隔离、超时控制。

### 1.7 可观测性服务 `core/services/observability`

**怎么完成：**

- 8 个模块：types、metrics、health、logger、tracing、server、service、server-entry。
- 三层指标 + 总线指标，共 9 个。
- 两个端点：`/metrics` + `/health`。

### 1.8 CI 配置 `.github/workflows/`

**怎么完成：**

- `ci.yml`：5 个并行 job + 1 个汇总。
- `security.yml`：gitleaks + pnpm audit。
- `dependabot.yml`、PR 模板、Issue 模板。

### 1.9 registry `scripts/`

**怎么完成：**

- `scripts/lib/scanner.js`：遍历目录找 `plugin.json`。
- `scripts/lib/validator.js`：校验 manifest。
- `scripts/lib/topo.js`：Kahn 算法拓扑排序。
- `scripts/lib/profiles.js`：profile → 插件名列表。
- `scripts/build-registry.js`：主入口。
- `scripts/check-registry.js`（阶段二补）：校验 registry 结构。

### 1.10 docs

**怎么完成：**

- 8 个阶段一功能文档 + `docs/README.md`。

### 1.11 tests

**怎么完成：**

- 扁平结构，命名规范 `功能名.（附加说明）.test.ts`。
- 前缀区分层级：无前缀=单元，`integration.`=集成，`e2e.`=端到端。
- 阶段一 23 个 suite、142 个测试全绿。

### 1.12 安全基础 `core/libs/src/security/`

**怎么完成：**

- 9 个子模块：constants、jwt、auth、validation、secrets、command-signature、rate-limiter、replay-guard、index。
- JWT 用 HS256，访问 token 1h，refresh 7d。
- 指令签名：HMAC-SHA256 + timingSafeEqual + 时间窗。
- 限流器和防重放：时间源可注入。

---

## 阶段二：核心数据流服务 ✅ 已完成

阶段二全部任务已完成。

### 2.0 根配置改动

**怎么完成：**

- `tsconfig.base.json` 加 `@apiscloud/simulator`、`@apiscloud/ingest`、`@apiscloud/data-writer` 三组 paths。
- 根 `tsconfig.json` 加三个 references。
- `jest.config.js` 加 6 条 `moduleNameMapper` + 3 条 `collectCoverageFrom`。
- `.env` 加 `SIMULATOR_PORT=9107`。
- `.env.example` 同步 MQTT 端口 `11883`、Grafana 端口 `13000`，加 `SIMULATOR_PORT`。
- `prometheus.yml` 加 simulator target `host.docker.internal:9107`。
- `.eslintrc.json` 加 `@typescript-eslint/no-unused-vars` 忽略 `_` 前缀。
- Makefile 加 `init-topics` 命令。
- 根 `package.json` 加 `kafkajs` devDependency。

### 2.1 simulator `core/services/simulator/`

**实现思路：**

- 模拟一个外部自动驾驶系统，产生 500 辆车状态，通过 MQTT 上报。
- 不直接写总线，不直接写库。
- 状态机 + GPS 生成器 + 车队管理。
- 暴露 `/metrics` 和 `/health`，端口 9107。

**实现过程：**

- `types.ts`：`VehicleState` 字段与 `init.sql` 的 `vehicle_telemetry` 对齐。
- `config.ts`：8 个环境变量，全部有默认值。
- `gps-generator.ts`：4 个纯函数，`randomPointInRadius` 用 sqrt 保证面积均匀。
- `state-machine.ts`：`nextState` 和 `nextBattery` 都是纯函数。
- `vehicle.ts`：单车模型，封装位置、电量、状态、目标点、tick 逻辑。
- `fleet.ts`：车队管理，批量 tick。
- `mqtt-publisher.ts`：MQTT 上报，QoS 1。
- `service.ts`：组合车队 + 发布器 + 可观测性。
- `server-entry.ts`：独立启动入口。

**实机验证：**

- 500 辆车，1 秒间隔，25 秒发 12500 条。
- `mosquitto_sub` 收到消息。
- `/metrics` 显示 `apiscloud_dataflow_messages_total{topic="telemetry/raw",direction="out"} 12500`。
- `/health` 三个检查项 ok。

### 2.2 ingest `core/services/ingest/`

**实现思路：**

- 唯一外部出入口，做协议转换和输入校验。
- 上行：MQTT `telemetry/raw` → 校验 → Envelope → 总线 `telemetry.raw`。
- 下行：总线 `events.commands` → 校验 → MQTT `commands/{vehicle_id}`。
- 暴露 `/metrics` 和 `/health`，端口 9103。

**实现过程：**

- `types.ts`：`UplinkTelemetry`、`DownlinkCommand`、`IngestConfig`。
- `config.ts`：3 个环境变量。
- `validation.ts`：zod schema，复用 libs 的 `VehicleId`、`Latitude`、`Longitude`、`Battery`。
- `mapper.ts`：`telemetryToEnvelope`、`envelopeToCommand`。
- `mqtt-subscriber.ts`、`mqtt-publisher.ts`：MQTT 双向，独立连接。
- `bus-publisher.ts`、`bus-subscriber.ts`：总线双向，封装 `MessageBus`。
- `service.ts`：组合所有，处理上行和下行，可注入依赖。
- `server-entry.ts`：独立启动入口。

**关键设计：**

- 可注入 `mqttSubscriber`、`mqttPublisher`、`bus`。
- 每条消息独立 try/catch。
- `partitionKey = vehicle_id`。
- 非法遥测丢弃并 warn。
- 消费者组 `apiscloud-ingest`。

### 2.3 data-writer `core/services/data-writer/`

**实现思路：**

- 唯一写库者，只订阅总线，不连 MQTT。
- 订阅 3 个主题：`telemetry.raw`、`telemetry.aggregated`、`events.alerts`。
- 写 PG：`vehicle_latest`（UPSERT）、`vehicle_telemetry`（INSERT）、`alerts`（INSERT）。
- 写 Redis：`vehicle:{id}:latest`（TTL 60s）、`vehicles:active`、`alerts:recent`、`region:{region}:stats`。
- 暴露 `/metrics` 和 `/health`，端口 9104。

**实现过程：**

- `types.ts`：`TelemetryRawPayload`、`TelemetryAggregatedPayload`、`AlertPayload`、`DataWriterConfig`。
- `config.ts`：3 个环境变量。
- `mapper.ts`：6 个映射函数，`ts` 毫秒转 ISO。
- `pg-writer.ts`：3 个方法，SQL 语句集中定义。
- `redis-writer.ts`：3 个方法，`writeVehicleLatest`、`writeRecentAlert`、`writeRegionStats`。
- `handlers/*.ts`：三个主题的处理逻辑，用 `observability.metrics.dataFlowMessages` 递增。
- `service.ts`：组合，订阅三个主题，可注入依赖。
- `server-entry.ts`：独立启动入口。

**关键设计：**

- 可注入 `pg`、`redis`、`bus`。
- 每条消息独立 try/catch。
- 消费者组 `apiscloud-data-writer`。
- 指标用 `observability.metrics.dataFlowMessages`，不创建新 counter。

### 2.4 主题定义

**怎么完成：**

- `shared/message-bus/topics.ts` 确认 4 个主题，不改代码。
- `tests/messageBus.topics.test.ts` 9 个测试锁定主题名。
- `scripts/init-kafka-topics.js` 幂等创建主题，指定分区数和保留策略。
- Makefile 加 `init-topics` 命令。

**4 个主题的分区数和保留策略：**

| 主题 | 分区数 | 保留 | 理由 |
|---|---|---|---|
| telemetry.raw | 6 | 6h | 高频，短期保留 |
| telemetry.aggregated | 3 | 72h | 聚合数据，中期保留 |
| events.commands | 3 | 7d | 指令审计需要追溯 |
| events.alerts | 3 | 7d | 告警追溯 |

### 2.5-2.7 单元测试

**怎么完成：**

- `tests/simulator.*.test.ts`：5 个 suite，63 个测试。
- `tests/ingest.*.test.ts`：5 个 suite，约 30 个测试。
- `tests/dataWriter.*.test.ts`：5 个 suite，约 30 个测试。

### 2.8 集成测试

**怎么完成：**

- `tests/integration.mqttToPg.test.ts`：13 个测试。
- 用共享 `MemoryAdapter`，ingest 和 data-writer 用同一实例。
- Mock MQTT、Mock PG、Mock Redis。
- 验证上行、下行、边界、规模。

### 2.9 文档

**怎么完成：**

- `docs/simulator.V1.md`、`docs/ingest.V1.md`、`docs/dataWriter.V1.md`。
- `docs/messageBus.V2.md`（替代 V1）。
- `docs/architecture.V2.md`（替代 V1）。
- `docs/README.md` 更新索引。
- 根 `README.md` 加服务启动说明。

---

## 阶段二还没完成的部分

**结论：阶段二 100% 完成。**

| 阶段 | 状态 | 未完成内容 |
|---|---|---|
| 阶段一 | ✅ 已完成 | 无 |
| 阶段二 | ✅ 已完成 | 无 |
| 阶段三 | ⬜ 未开始 | dispatch-core、3 个调度算法插件、geofence、anomaly |
| 阶段四 | ⬜ 未开始 | gateway、前端外壳、dashboard、前端插件加载器 |
| 阶段五 | ⬜ 未开始 | 插件生态、消息总线性能优化 |
| 阶段六 | ⬜ 未开始 | 测试完善、可观测性完善、安全完善、部署、交付 |

---

# 第三部分：阶段二踩过的坑

## 1. 工程配置阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | `make registry-check` 报 `Unterminated quoted string` | Makefile 里的多行 `node -e "..."` 被 sh 拆成多个命令，引号未闭合 | 抽出 `scripts/check-registry.js`，Makefile 只调一行 |
| 2 | `pnpm lint` 报 12 个 `.d.ts` 解析错误 | `core/libs/src/` 下误生成了 `.d.ts` 文件，ESLint 的 `parserOptions.project` 找不到它们 | `find core/libs/src -name '*.d.ts' -type f -delete` |
| 3 | `@typescript-eslint/no-var-requires` 注释过期 | ESLint 8.x 把规则改名为 `no-require-imports` | 改注释里的规则名 |
| 4 | `import/order` 警告 | import 顺序不对 | `pnpm lint:fix` + 手动修 `zod` 的位置 |
| 5 | `_drop` 未使用警告 | ESLint 默认不忽略 `_` 前缀 | `.eslintrc.json` 加 `argsIgnorePattern`、`varsIgnorePattern`、`caughtErrorsIgnorePattern` |

## 2. simulator 阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | `gps-generator.ts` 报 TS2349 "此表达式不可调用" | `moveTowards` 参数名 `distanceKm` 遮蔽了同文件函数 `distanceKm` | 参数名改为 `stepKm` |
| 2 | `/health` 输出看起来乱码 | 终端把长 JSON 单行输出做了字符覆盖，实际 JSON 完整 | 用 `curl -s ... \| jq` 查看 |
| 3 | `emqx ctl topics list` 返回 No topics | EMQX 5.x 的 `topics list` 只列订阅关系，不列所有消息 topic | 用 `mosquitto_sub` 订阅验证 |

## 3. ingest 阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | `_drop` 未使用警告 | 同工程配置问题 | ESLint 配置 `_` 前缀忽略 |

## 4. data-writer 阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | TS2740 类型不匹配 | `service.ts` 传的是 `observability.metrics.registry`（类型 `MetricsRegistry`），handler 期望的是 `observability.metrics`（类型 `ObservabilityMetrics`） | `sed -i 's/metrics: observability.metrics.registry/metrics: observability.metrics/g'` |
| 2 | `telemetry-aggregated` 没有对应的 RedisWriter 方法 | `RedisWriter` 接口只暴露了 `writeVehicleLatest` 和 `writeRecentAlert` | 给 `RedisWriter` 加 `writeRegionStats` 方法 |
| 3 | prom-client 重复注册风险 | handler 里 `metrics.registry.counter(...)` 每次都创建新 Counter 注册到同一 registry | 不创建新 counter，直接用 `observability.metrics.dataFlowMessages` |

## 5. 主题定义阶段

| # | 问题 | 原因 | 解决 |
|---|---|---|---|
| 1 | `make init-topics` 报 `Cannot find module 'kafkajs'` | pnpm 严格 node_modules 结构，根目录没声明 `kafkajs` | `pnpm add -D -w kafkajs@^2.2.4` |

## 6. 关键教训汇总

1. **Makefile 里不要写多行 `node -e`**，抽独立脚本。
2. **不要直接在包目录里跑 `tsc`**，用 `pnpm build` 或 `tsc -b`。
3. **ESLint 规则升级后要检查 `eslint-disable` 注释的规则名**。
4. **`_` 前缀忽略未使用变量应在 ESLint 配置里一次加好**。
5. **函数名和参数名不要重名**，避免遮蔽。
6. **curl 长 JSON 输出加 `-s` 关进度条，用 `jq` 格式化**。
7. **EMQX 5.x 的 `topics list` 列的是订阅关系**，验证 MQTT 发布要用订阅者。
8. **handler 用现成指标，不碰底层 registry**，避免重复注册。
9. **不要在 handler 里绕过封装调 `redis.raw()`**，给 `RedisWriter` 加方法。
10. **pnpm 严格 node_modules**，根脚本用到的依赖必须在根 `package.json` 声明。
11. **`ObservabilityMetrics` 和 `MetricsRegistry` 不是一回事**，前者是 9 个预定义指标，后者是底层 prom-client 封装。
12. **CLI 是权威**：`pnpm typecheck`、`pnpm test:unit` 全绿就是验收标准。

---

# 第四部分：文件清单

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

## `core/libs/` — 共享库（阶段一）

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
    │   ├── types.ts
    │   └── index.ts              — createLogger、withContext
    ├── health/
    │   ├── types.ts
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

## `core/plugin-host/` — 插件宿主（阶段一）

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

## `core/services/observability/` — 可观测性（阶段一）

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

## `core/services/simulator/` — 模拟器（阶段二新增）

```
core/services/simulator/
├── package.json                  — @apiscloud/simulator
├── tsconfig.json                 — references: libs、observability
└── src/
    ├── index.ts                  — 统一出口
    ├── server-entry.ts           — 独立启动入口
    ├── types.ts                  — VehicleState、SimulatorConfig
    ├── config.ts                 — loadSimulatorConfig
    ├── gps-generator.ts          — randomPointInRadius、distanceKm、moveTowards、bearing
    ├── state-machine.ts          — nextState、nextBattery
    ├── vehicle.ts                — Vehicle 类
    ├── fleet.ts                  — Fleet 类
    ├── mqtt-publisher.ts         — createMqttPublisher
    └── service.ts                — createSimulatorService
```

## `core/services/ingest/` — MQTT 出入口（阶段二新增）

```
core/services/ingest/
├── package.json                  — @apiscloud/ingest
├── tsconfig.json                 — references: libs、message-bus、observability
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts                  — UplinkTelemetry、DownlinkCommand、IngestConfig
    ├── config.ts                 — loadIngestConfig
    ├── validation.ts             — UplinkTelemetrySchema、DownlinkCommandSchema
    ├── mapper.ts                 — telemetryToEnvelope、envelopeToCommand
    ├── mqtt-subscriber.ts        — createMqttSubscriber
    ├── mqtt-publisher.ts         — createMqttPublisher
    ├── bus-publisher.ts          — createBusPublisher
    ├── bus-subscriber.ts         — createBusSubscriber
    └── service.ts                — createIngestService
```

## `core/services/data-writer/` — 统一写库（阶段二新增）

```
core/services/data-writer/
├── package.json                  — @apiscloud/data-writer
├── tsconfig.json                 — references: libs、message-bus、observability
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts                  — TelemetryRawPayload、TelemetryAggregatedPayload、AlertPayload、DataWriterConfig
    ├── config.ts                 — loadDataWriterConfig
    ├── mapper.ts                 — 6 个映射函数
    ├── pg-writer.ts              — createPgWriter
    ├── redis-writer.ts           — createRedisWriter
    ├── handlers/
    │   ├── telemetry-raw.ts      — handleTelemetryRaw
    │   ├── telemetry-aggregated.ts — handleTelemetryAggregated
    │   └── events-alerts.ts      — handleEventsAlerts
    └── service.ts                — createDataWriterService
```

## `core/registry/` — 注册表（阶段一）

```
core/registry/
├── .gitkeep
└── registry.json                 — 生成产物（不进 Git）
```

## `core/services/*/plugin.json` — 核心服务 manifest

```
core/services/
├── infra/plugin.json
├── gateway/plugin.json
├── plugin-host/plugin.json
├── libs/plugin.json
├── ingest/plugin.json
├── data-writer/plugin.json
├── simulator/plugin.json
├── dispatch-core/plugin.json
├── observability/plugin.json
└── registry/plugin.json
```

## `shared/message-bus/` — 消息总线（阶段一）

```
shared/message-bus/
├── package.json
├── tsconfig.json
├── interface.ts                  — MessageBus 统一接口
├── envelope.ts                   — Envelope + createEnvelope/validateEnvelope
├── topics.ts                     — TOPICS 常量（4 个主题）
├── factory.ts                    — createMessageBus
├── index.ts
└── adapters/
    ├── memory.ts                 — MemoryAdapter
    ├── mqtt.ts                   — MqttAdapter
    └── kafka.ts                  — KafkaAdapter
```

## `shared/types/` 和 `shared/contracts/`（阶段一）

```
shared/types/
├── package.json
├── tsconfig.json
└── index.ts                      — HealthStatus

shared/contracts/
├── package.json
├── tsconfig.json
└── index.ts                      — Envelope 接口
```

## `shared/layer-config/` — 层配置（阶段一）

```
shared/layer-config/
├── package.json
├── tsconfig.json
├── layers.yml                    — 层配置（单层 + 注释预留多层）
├── schema.ts                     — LayersConfigSchema、KNOWN_SERVICES
├── loader.ts                     — loadLayers、getLayer、getServices 等
└── index.ts
```

## `plugins/` — 插件目录（阶段一）

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
├── check-registry.js             — 校验 registry 结构（阶段二新增）
├── init-kafka-topics.js          — 幂等创建 Kafka 主题（阶段二新增）
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
├── messageBus.topics.test.ts              ← 阶段二新增
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
├── simulator.stateMachine.test.ts         ← 阶段二新增
├── simulator.gpsGenerator.test.ts         ← 阶段二新增
├── simulator.vehicle.test.ts              ← 阶段二新增
├── simulator.fleet.test.ts                ← 阶段二新增
├── simulator.config.test.ts               ← 阶段二新增
├── ingest.validation.test.ts              ← 阶段二新增
├── ingest.mapper.test.ts                  ← 阶段二新增
├── ingest.config.test.ts                  ← 阶段二新增
├── ingest.mqttToBus.test.ts               ← 阶段二新增
├── ingest.busToMqtt.test.ts               ← 阶段二新增
├── dataWriter.config.test.ts              ← 阶段二新增
├── dataWriter.mapper.test.ts              ← 阶段二新增
├── dataWriter.pgWriter.test.ts            ← 阶段二新增
├── dataWriter.redisWriter.test.ts         ← 阶段二新增
├── dataWriter.handlers.test.ts            ← 阶段二新增
├── integration.mqttToPg.test.ts           ← 阶段二新增
├── jest.config.js
└── setup.js
```

## `docs/` — 文档

```
docs/
├── README.md                     — 文档索引
├── architecture.V2.md            — 系统架构（替代 V1）
├── infra.V1.md                   — 基础设施编排
├── messageBus.V2.md              — 消息总线（替代 V1）
├── layerConfig.V1.md             — 层配置
├── pluginHost.V1.md              — 插件宿主
├── observability.V1.md           — 可观测性
├── security.V1.md                — 安全基础
├── cicd.V1.md                    — CI/CD
├── simulator.V1.md               — 模拟器（阶段二新增）
├── ingest.V1.md                  — MQTT 出入口（阶段二新增）
└── dataWriter.V1.md              — 统一写库（阶段二新增）
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
├── prometheus/prometheus.yml     — 抓取配置（阶段二加了 simulator）
├── loki/loki-config.yml          — Loki 配置
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
│   ├── ci.yml                    — 主 CI 流水线
│   └── security.yml              — 安全扫描
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
make typecheck      # ✅ 通过
make lint           # ✅ 通过，0 warning
make test-unit      # ✅ 33 个 suite，约 265 个测试全绿
make test-integration # ✅ 13 个集成测试全绿
make test-coverage  # ✅ 生成覆盖率报告
make build          # ✅ 全部构建成功
make infra-up       # ✅ 7 个服务 healthy
make build-registry # ✅ 生成 registry.json，10 个服务
make registry-check # ✅ registry 校验通过
make init-topics    # ✅ 需要 Kafka 启动才能跑
```

## 阶段二验收清单

- [x] 类型检查通过
- [x] Lint 通过，0 warning
- [x] 单元测试通过
- [x] 集成测试通过
- [x] 构建通过
- [x] Registry 校验通过
- [x] simulator 实机验证 500 辆车 MQTT 上报
- [x] ingest 上行/下行逻辑单元测试通过
- [x] data-writer 三个主题处理逻辑单元测试通过
- [x] 集成测试验证 MQTT → 总线 → PG 全链路
- [x] 四篇 V1/V2 文档就位

## 下一步：阶段三

**阶段目标：** 实现智能驾驶服务调度的核心业务能力，融入多维度调度算法。

**要做的：**

| 序号 | 任务 | 产出 |
|---|---|---|
| 3.1 | 开发 dispatch-core | `core/services/dispatch-core/` |
| 3.2 | 开发 nearest-dispatch 插件 | `plugins/dispatch/nearest/` |
| 3.3 | 开发 batch-match 插件 | `plugins/dispatch/batch-match/` |
| 3.4 | 开发 priority-dispatch 插件 | `plugins/dispatch/priority-dispatch/` |
| 3.5 | 开发 geofence 插件 | `plugins/geofence/` |
| 3.6 | 开发 anomaly 插件 | `plugins/anomaly/` |
| 3.7-3.9 | 调度算法、geofence、anomaly 测试 | `tests/dispatch.*.test.ts` 等 |
| 3.10 | 集成测试 | `tests/integration.dispatchFlow.test.ts` |
| 3.11 | 文档 | `docs/dispatchCore.V1.md` 等 |

**关键设计：**

- dispatch-core 订阅 `telemetry.aggregated`，发布 `events.commands`。
- 算法插件接收候选车辆 + 任务，返回排序结果。
- 硬约束过滤：续航、时间窗、服务能力、地理、法规、状态。
- 目标函数加权：等待时间、完成率、空驶率、匹配率。
- 算法超时/失败回退到 nearest。

**dispatch-core 与算法插件的关系：**

| 角色 | 职责 |
|---|---|
| dispatch-core | 任务接收、约束过滤、算法调度、结果下发、签名 |
| 算法插件 | 接收候选车辆 + 任务，返回排序后的候选 |
| 算法选择 | 按任务类型 + 场景 + 配置选择算法 |
| 多算法协作 | 可串行（过滤+排序）或并行（投票） |
| 算法切换 | 运行时切换，正在执行的任务用旧算法完成 |
| 算法回退 | 算法超时/失败时回退到 nearest |

## 重开对话时的最小上下文

如果重开对话，只需提供以下信息即可继续：

1. **本文档**（描述项目全局）。
2. **当前任务的代码**（如阶段三的 dispatch-core 实现）。
3. **`package.json`、`tsconfig.base.json`、`jest.config.js`** 三个关键配置（如需要）。

我就能接着往下干。

---

**文档版本：** V2  
**对应阶段：** 阶段一、阶段二完成，阶段三未开始  
**最后更新：** 阶段二完成时