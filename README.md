# **ApisCloud - 蜂云** 智能驾驶服务调度系统

[![CI](https://github.com/7-hello007/ApisCloud/actions/workflows/ci.yml/badge.svg)](https://github.com/7-hello007/ApisCloud/actions/workflows/ci.yml)
[![Security](https://github.com/7-hello007/ApisCloud/actions/workflows/security.yml/badge.svg)](https://github.com/7-hello007/ApisCloud/actions/workflows/security.yml)

面向千万级智能驾驶车辆的服务调度系统。接入外部自动驾驶系统上报的数据，处理后做调度决策，下发指令给外部系统。

---

## 定位

| 维度 | 本系统 |
|---|---|
| **我们做** | 接入数据、处理数据、调度决策、下发指令 |
| **我们不做** | 不造自动驾驶系统、不控车、不采原始传感器、不负责车辆安全 |
| **对接对象** | 外部自动驾驶系统 |
| **调度对象** | 智能驾驶车辆 |
| **车辆规模** | 千万级 |
| **服务类型** | 载客、巡检、物流、充电、维护、救援等 |
| **实时性** | 毫秒级到秒级 |
| **安全要求** | 极高（调度指令签名与校验） |

**核心差异：我们是调度平台，不是自动驾驶系统。**

---

## 快速开始

### 前置要求

| 项 | 版本 | 检查命令 |
|---|---|---|
| Node.js | ≥ 20 | `node -v` |
| pnpm | ≥ 9 | `pnpm -v` |
| Docker | ≥ 20 | `docker -v` |
| Docker Compose | ≥ 2 | `docker compose version` |

### 安装

```bash
git clone https://github.com/7-hello007/ApisCloud.git
cd ApisCloud
pnpm install
cp .env.example .env
```

### 一键启动

```bash
# 启动全部：基础设施 + 后端服务 + 前端
./scripts/start.sh

# 或指定 profile
./scripts/start.sh PROFILE=full
```

**等 30 秒，访问：**

| 服务 | 地址 | 账号 |
|---|---|---|
| 前端 | http://localhost:5173 | — |
| Gateway | http://localhost:9101/health | — |
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:13000 | admin / apiscloud |
| EMQX | http://localhost:18083 | admin / apiscloud |

### 一键停止

```bash
# 停止后端和前端，保留基础设施
make stop

# 停止全部
./scripts/dev-down.sh

# 停止全部并删除数据
./scripts/dev-down.sh --reset
```

### 快速验证

```bash
# 单元测试
make test-unit

# 代码检查
make lint

# 类型检查
make typecheck

# 端到端验证（需要服务在跑）
./scripts/verify-e2e.sh
```

---

## 系统架构

**插件化微服务架构 + 事件驱动架构 + 分层部署架构。**

| 层面 | 架构模式 | 说明 |
|---|---|---|
| 整体结构 | 插件化微服务 | 核心服务 + 插件，独立部署，独立演进 |
| 通信方式 | 事件驱动 | 服务之间通过消息总线通信，不直接调用 |
| 扩展方式 | 插件化 | 新增功能 = 新增插件目录 + plugin.json |
| 部署形态 | 分层部署 | 服务与层分离，层是配置，可单层可多层 |
| 前端形态 | 微前端 | 前端外壳 + 插件前端模块动态加载 |

### 核心特征

- **核心服务每次全启，冻结维护。**
- **插件按 profile 选择启动，自由迭代。**
- **数据流单一**：外部 → Ingest → 消息总线 → 业务服务 → 消息总线 → Data-Writer → 存储。
- **只有 Ingest 连外部，只有 Data-Writer 连库。**
- **服务之间零直接调用，只通过消息总线。**
- **消息总线可切换，不绑定 Kafka。**

### 数据流

```
外部系统 ──MQTT──→ EMQX ──→ ingest ──→ telemetry.raw
                                          │
                                          ├─→ data-writer → PG/Redis
                                          ├─→ dispatch-core → events.commands
                                          ├─→ aggregator → telemetry.aggregated
                                          │                  │
                                          │                  └─→ charging-scheduler → events.commands
                                          └─→ gateway → geofence/anomaly/route-optimizer → events.commands/alerts

events.commands ──→ ingest → MQTT commands/{vehicle_id} → 外部系统
                 └─→ data-writer → PG dispatch_commands

events.alerts ──→ data-writer → PG alerts + Redis alerts:recent
```

---

## 项目结构

```
ApisCloud/
│
├── core/                                    # 核心（与层无关）
│   ├── libs/                                # 共享库（config/logger/pg/redis/mqtt/metrics/security）
│   ├── plugin-host/                         # 插件宿主（进程内扩展）
│   ├── registry/                            # 预生成注册表（生成产物）
│   └── services/                            # 核心服务
│       ├── observability/                   # 可观测性（指标 + 健康 + 日志）
│       ├── simulator/                       # 模拟器（500 辆模拟车）
│       ├── ingest/                          # MQTT 出入口（唯一外部出入口）
│       ├── data-writer/                     # 统一写库（唯一连库者）
│       ├── dispatch-core/                   # 调度核心（算法可插拔）
│       ├── aggregator/                      # 聚合器（raw → aggregated）
│       └── gateway/                         # HTTP 统一入口
│
├── shared/                                  # 层共享
│   ├── message-bus/                         # 消息总线抽象（Memory/MQTT/Kafka 适配器）
│   ├── layer-config/                        # 层配置（layers.yml）
│   ├── contracts/                           # 数据契约
│   └── types/                               # 共享类型
│
├── plugins/                                 # 插件（进程内）
│   ├── _template/                           # 模板插件（扫描时跳过）
│   ├── dispatch/                            # 调度算法插件
│   │   ├── nearest/                         # 最近邻
│   │   ├── batch-match/                     # 批量匹配
│   │   └── priority-dispatch/               # 优先级调度
│   ├── geofence/                            # 地理围栏
│   ├── anomaly/                             # 异常检测
│   ├── dashboard/                           # 仪表板（前端）
│   ├── charging-scheduler/                  # 充电调度
│   ├── route-optimizer/                     # 路线优化
│   └── reporting/                           # 报表
│
├── web/                                     # 前端外壳（Vite + React 18 + TS + Tailwind）
│   ├── src/
│   │   ├── shell/                           # 布局、侧边栏、顶栏、主题
│   │   ├── runtime/                         # 插件加载器、注册表
│   │   ├── components/ui/                   # 基础 UI 组件
│   │   ├── api/                             # HTTP 客户端
│   │   └── plugins/                         # 插件前端模块
│   └── package.json
│
├── monitor/                                 # 监控配置
│   ├── prometheus/                          # 指标抓取
│   ├── grafana/                             # 数据源 + 仪表板
│   └── loki/                                # 日志聚合
│
├── deploy/                                  # 部署配置
│   ├── postgres/init.sql                    # 数据库初始化
│   ├── redis/redis.conf
│   └── emqx/emqx.conf
│
├── scripts/                                 # 脚本
│   ├── start.sh                             # 一键启动
│   ├── dev-up.sh                            # 底层启动
│   ├── dev-down.sh                          # 停止
│   ├── dev-status.sh                        # 状态查看
│   ├── test.sh                              # 分层测试
│   ├── verify-e2e.sh                        # 端到端验证
│   ├── verify-multi-scale.sh                # 多规模验证
│   ├── test-alerts.sh                       # 手动触发告警
│   ├── test-commands.sh                     # 手动触发指令
│   ├── build-registry.js                    # 注册表生成
│   ├── check-registry.js                    # 注册表校验
│   ├── init-kafka-topics.js                 # Kafka 主题初始化
│   └── lib/                                 # 扫描、校验、拓扑、profile
│
├── tests/                                   # 测试（扁平结构）
│   ├── helpers/                             # 测试辅助
│   ├── *.test.ts                            # 单元测试
│   ├── integration.*.test.ts                # 集成测试
│   └── e2e.*.test.ts                        # 端到端测试
│
├── docs/                                    # 文档（一个功能一个文档）
│   ├── README.md                            # 文档索引
│   ├── architecture.V2.md
│   ├── messageBus.V3.md
│   ├── layerConfig.V3.md
│   ├── pluginHost.V2.md
│   ├── observability.V2.md
│   ├── security.V2.md
│   ├── deployment.V1.md
│   ├── testing.V1.md
│   ├── api.V1.md
│   ├── delivery.V1.md
│   └── ...                                  # 每个功能一个文档
│
├── .github/                                 # GitHub Actions
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── security.yml
│   └── dependabot.yml
│
├── Makefile                                 # 统一命令入口
├── docker-compose.infra.yml                 # 基础设施编排
├── pnpm-workspace.yaml                      # workspace 声明
├── tsconfig.base.json                       # TS 共享配置
└── jest.config.js                           # Jest 全局配置
```

---

## 核心服务（10 个）

| 序号 | 服务 | 端口 | 职责 |
|---|---|---|---|
| 1 | infra | — | Docker Compose 编排基础设施 |
| 2 | gateway | 9101 | HTTP 统一入口（路由注入 + 反向代理） |
| 3 | plugin-host | 9102 | 插件宿主（进程内扩展） |
| 4 | libs | — | 共享库 |
| 5 | ingest | 9103 | MQTT 出入口（唯一外部出入口） |
| 6 | data-writer | 9104 | 统一写库（唯一连库者） |
| 7 | dispatch-core | 9105 | 调度核心（算法可插拔） |
| 8 | observability | 9106 | 监控 + 日志 + 追踪预留 |
| 9 | simulator | 9107 | 模拟数据源（500 辆模拟） |
| 10 | aggregator | 9108 | 聚合器（raw → aggregated） |

**核心服务每次全启，冻结维护。**

---

## 插件（10 个）

| 插件 | 订阅主题 | 说明 |
|---|---|---|
| nearest | — | 最近邻算法（Haversine 距离排序） |
| batch-match | — | 批量匹配（多因素成本最小化） |
| priority-dispatch | — | 优先级调度（动态调整权重） |
| geofence | telemetry.raw | 地理围栏（圆形区域进出告警） |
| anomaly | telemetry.raw | 异常检测（速度超阈值 + 电量骤降） |
| dashboard | — | 仪表板（总览、车辆、告警、指令） |
| charging-scheduler | telemetry.aggregated | 充电调度（检测低电量，发指令） |
| route-optimizer | telemetry.raw（filter） | 路线优化（检测低速车，发指令） |
| reporting | —（HTTP 路由） | 报表（从 data-writer 查询） |
| example-plugin | — | 示例插件 |

**插件按 profile 选择启动，自由迭代。**

---

## 消息主题（4 个）

| 主题 | 分区 | 保留 | 生产者 | 消费者 |
|---|---|---|---|---|
| telemetry.raw | 6 | 6h | ingest | data-writer、dispatch-core、aggregator、gateway |
| telemetry.aggregated | 3 | 72h | aggregator | data-writer、gateway |
| events.commands | 3 | 7d | dispatch-core、charging-scheduler、route-optimizer | ingest、data-writer |
| events.alerts | 3 | 7d | geofence、anomaly | data-writer |

**消费者组用复合 groupId**：`<base>--<topic 去点>`（如 `apiscloud-data-writer--telemetry-raw`）。

---

## 常用命令

### 环境

```bash
make install             # 安装依赖
make build               # 构建所有包
make clean               # 清理
```

### 开发

```bash
make start               # 一键启动（默认 PROFILE=core）
make start PROFILE=full  # 启动 full profile
make start LAYERS=multi  # 启动多层
make stop                # 停止后端和前端
make restart             # 重启
make status              # 查看服务状态
```

### 测试

```bash
make test                # 全部测试
make test-unit           # 单元测试
make test-integration    # 集成测试
make test-e2e            # 端到端测试
make test-coverage       # 带覆盖率
make test-watch          # 监听模式
make test-file FILE=...  # 跑单个文件

# 分层测试入口
./scripts/test.sh unit
./scripts/test.sh integration
./scripts/test.sh e2e
./scripts/test.sh check    # 完整验证
```

### 代码质量

```bash
make lint                # 代码检查
make format              # 格式化
make typecheck           # 类型检查
```

### 基础设施

```bash
make infra-up            # 启动基础设施
make infra-down          # 停止（保留数据）
make infra-logs          # 查看日志
make infra-ps            # 查看状态
make infra-reset         # 重置（删数据）
```

### Registry 与主题

```bash
make build-registry      # 生成插件注册表
make registry-check      # 生成并校验
make init-topics         # 初始化 Kafka 主题
```

### 验证

```bash
make verify-e2e          # 真实基础设施端到端验证
make verify-multi-scale  # 多规模验证（500 / 1000 / 2000）
```

---

## 六阶段

| 阶段 | 内容 | 状态 |
|---|---|---|
| **阶段一** | 基础设施与共享库 | ✅ 完成 |
| **阶段二** | 核心数据流服务 | ✅ 完成 |
| **阶段三** | 核心业务服务与调度算法 | ✅ 完成 |
| **阶段四** | 插件系统与前端外壳 | ✅ 完成 |
| **阶段五** | 插件生态与性能优化 | ✅ 完成 |
| **阶段六** | 测试完善、部署与交付 | ✅ 完成 |

### 阶段一：基础设施与共享库

- Docker Compose 编排 7 个服务：PostgreSQL、Redis、EMQX、Kafka、Prometheus、Loki、Grafana。
- 共享库：config、logger、health、pg、redis、mqtt、metrics、security。
- 消息总线抽象层：Memory/MQTT/Kafka 适配器。
- 层配置：`layers.yml` 单层，预留多层。
- 插件宿主：加载、注册、生命周期、异常保护。
- 可观测性：9 个指标 + 2 个端点。
- CI/CD：GitHub Actions。
- 安全基础：认证、输入验证、密钥管理。

### 阶段二：核心数据流服务

- simulator：500 辆车，MQTT 上报，状态机 + GPS。
- ingest：唯一外部出入口，双向转换。
- data-writer：唯一写库者，订阅 3 个主题。
- 4 个主题：telemetry.raw、telemetry.aggregated、events.commands、events.alerts。
- 集成测试：`integration.mqttToPg.test.ts`。

### 阶段三：核心业务服务与调度算法

- dispatch-core：任务分发、硬约束过滤、目标函数、算法插件、签名。
- 3 个算法插件：nearest、batch-match、priority-dispatch。
- geofence、anomaly 插件。
- data-writer 扩展：订阅 events.commands，写 dispatch_commands。
- 集成测试：`integration.dispatchFlow.test.ts`、`integration.alertFlow.test.ts`。

### 阶段四：插件系统与前端外壳

- plugin-host 增强：`PluginContext` 注入 bus、createEnvelope、topics。
- geofence / anomaly 接入 plugin-host。
- gateway：HTTP 统一入口，3 种路由，内部创建 PluginHost。
- 前端外壳：Vite + React 18 + TS + Tailwind。
- UI 组件：7 个。
- dashboard 插件：4 个页面。
- 主题系统：CSS 变量 + dark 类。

### 阶段五：插件生态与性能优化

- aggregator 核心服务。
- charging-scheduler、route-optimizer、reporting 插件。
- filter 机制：`plugin.json` 的 `topics.filter`。
- 懒订阅：`lazy` 标记 + `activated` 集合。
- 共享消费者组：gateway 单组 + `getSubscribedTopics()`。
- 主题分层语义：`topics.ts` 加分层注释。
- 按车辆分区：`partitionKey = vehicle_id`。
- 总线切换验证：Memory / Kafka / MQTT。

### 阶段六：测试完善、部署与交付

- e2e 测试：`e2e.fullPipeline`、`e2e.frontendApi`。
- 覆盖率补全：8 个测试文件。
- 业务指标：5 个新指标。
- Grafana 仪表板：6 个 panel。
- 插件端指标上报：`PluginMetrics` 注入。
- 安全性完善：JWT + 限流 + 指令签名。
- 启动/测试脚本：`start.sh`、`test.sh`、`verify-e2e.sh`、`verify-multi-scale.sh`。
- 文档：`deployment.V1.md`、`testing.V1.md`、`api.V1.md`、`delivery.V1.md`。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 语言 | TypeScript 5.9 |
| 运行时 | Node.js 20+ |
| 包管理 | pnpm 11 |
| 消息总线 | Kafka 3.7（KRaft） |
| MQTT | EMQX 5.8 |
| 数据库 | PostgreSQL 16 |
| 缓存 | Redis 7 |
| 监控 | Prometheus 2.54 + Grafana 11.2 + Loki 3.1 |
| 前端 | Vite 5 + React 18 + TailwindCSS 3 |
| 路由 | React Router 6 |
| 测试 | Jest 29 + ts-jest |
| CI | GitHub Actions |

---

## 扩展点

| 想扩展 | 怎么做 | 核心改动 |
|---|---|---|
| 新增调度算法 | 加 `plugins/dispatch/xxx/`，写 `rank()` 函数 | 零 |
| 新增业务插件 | 加 `plugins/xxx/`，写 `plugin.json` + `onMessage` | 零 |
| 新增前端页面 | 加 `web/src/plugins/xxx/`，写 `index.tsx` | 零 |
| 新增核心服务 | 加 `core/services/xxx/`，更新 `layers.yml` 和 `KNOWN_SERVICES` | 少量 |
| 新增层 | 改 `layers.yml`，插一段 | 零 |
| 切换总线 | 改 `.env` 的 `MESSAGE_BUS` | 零 |
| 新增消息主题 | 在 `topics.ts` 加常量 | 少量 |
| 新增调度指令类型 | 在 `DownlinkCommand` 加 `command_type` | 少量 |

**核心代码零改动。**

---

## 文档

完整文档索引见 [`docs/README.md`](docs/README.md)。

### 关键文档

| 想了解… | 看哪个文档 |
|---|---|
| 项目交付总结 | `docs/delivery.V1.md` |
| 系统整体架构 | `docs/architecture.V2.md` |
| 怎么部署 | `docs/deployment.V1.md` |
| 怎么测试 | `docs/testing.V1.md` |
| 有哪些 API | `docs/api.V1.md` |
| 怎么加插件 | `docs/pluginHost.V2.md` |
| 怎么改层 | `docs/layerConfig.V3.md` |
| 怎么切总线 | `docs/messageBus.V3.md` |
| 有哪些指标 | `docs/observability.V2.md` |
| 安全怎么做的 | `docs/security.V2.md` |
| 调度算法怎么调 | `docs/dispatchCore.V1.md` |
| 性能怎么优化 | `docs/busPerformance.V1.md` |

---

## 开发原则

1. **核心稳定冻结，插件自由迭代。**
2. **新增功能优先加插件，不改核心。**
3. **只有 Ingest 连外部，只有 Data-Writer 连库。**
4. **服务之间零直接调用，只通过消息总线。**
5. **消息总线可切换，只改配置，业务代码零改动。**
6. **服务与层分离，加层只改配置，代码零改动。**
7. **兼容性改动可加字段，破坏性改动必须版本化。**
8. **安全内建，不是事后补。**
9. **每个功能一个文档，修改时版本递增。**
10. **测试三层覆盖，文档、CI、安全同步走。**

---

## 当前状态

| 项 | 值 |
|---|---|
| 阶段完成度 | 6/6 |
| 核心服务 | 10 个 |
| 插件 | 10 个 |
| 消息主题 | 4 个 |
| 单元测试 | 75 个 suite，约 557 个用例 |
| 集成测试 | 6 个 suite |
| e2e 测试 | 2 个 suite |
| 文档 | 30+ 个 |
| 端到端验证 | 17/17 通过 |

---

## 已知限制

| 项 | 现状 | 计划 |
|---|---|---|
| 压力测试（500 万级） | 未做 | 阶段六之后 |
| mTLS | 未做 | 阶段六之后 |
| 插件签名 | 未做 | 阶段六之后 |
| 多集群 | 结构预留 | 按规模需求 |
| 多媒介分段 | 结构预留 | 按需求 |
| K8s 部署清单 | 未做 | 阶段六之后 |
| WebSocket / SSE | 未做 | 阶段六之后 |
| 分库分表 | 未做 | 按规模需求 |
| 时序数据库 | 未做 | 按规模需求 |
| Redis 集群 | 未做 | 按规模需求 |
| dispatch-core HTTP 端点 | 未做 | 待补 |
| simulator 回 ACK | 未做 | 待补 |
| 限流（内存版） | 单实例有效 | 待补 Redis 版 |
| Promtail 采集日志 | 未做 | 待补 |

详细说明见 [`docs/delivery.V1.md`](docs/delivery.V1.md)。

---

## 贡献

### 提交前检查清单

- [ ] 本地跑通 `make lint`
- [ ] 本地跑通 `make typecheck`
- [ ] 本地跑通 `make test-unit`
- [ ] 新增/修改功能有测试
- [ ] 新增/修改功能有文档
- [ ] 未硬编码密钥
- [ ] 若改动核心契约，已说明兼容性影响

### 分支保护

主分支 `main` 和 `develop` 受保护：

- 需要 PR，1 approval
- 需要 CI 通过（`CI Success` + `Security Success`）
- 禁止直接 push 和 force push

---

## 联系方式

| 角色 | 联系方式 |
|---|---|
| 项目负责人 | Kenny |
| 邮箱 | Kenny@apiscloud.com |
| 仓库 | https://github.com/7-hello007/ApisCloud |

---

## License

Private. All rights reserved.