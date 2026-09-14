# **ApisCloud - 蜂云**：智能驾驶服务调度系统 · 项目计划书 V2

> **V2 修订说明：** 本版本在 V1 六阶段全部完成的基础上，将"未实现/未验证"的项重新组织为**阶段七~阶段十**，作为下一阶段规划。V1 已完成的内容保持不变，新增部分以「V2 新增」标注。

---

## 一、项目总目标

构建一套面向千万级智能驾驶车辆的服务调度系统，满足以下总目标：

| 编号 | 总目标 | 达成标准 | V1 状态 |
|---|---|---|---|
| 1 | 系统可运行 | 500 辆模拟车辆实时调度，数据从采集到展示闭环 | ✅ |
| 2 | 系统可扩展 | 新增功能只需新增插件，核心代码零改动 | ✅ |
| 3 | 系统可维护 | 核心稳定冻结，插件自由迭代 | ✅ |
| 4 | 系统可观测 | 监控、日志覆盖插件、服务、数据流 | ⚠️ 日志未接 Loki |
| 5 | 系统可测试 | 单元/集成/端到端三层测试覆盖 | ✅ |
| 6 | 系统可文档化 | 每个功能一个文档，记录版本演进 | ✅ |
| 7 | 系统可解耦 | 消息总线可切换，数据流不依赖单一媒介 | ✅ |
| 8 | 系统可演进 | 从 500 辆模拟到千万级真实车辆，架构不推翻 | ⚠️ 只验证 500 |
| 9 | 调度可多维 | 支持多种调度算法，覆盖空间、服务等级等维度 | ⚠️ 无多算法协作 |
| 10 | 插件可内嵌 | 插件支持进程内扩展，降低部署与运维复杂度 | ✅ |
| 11 | 工程可自动化 | 具备 CI/CD 流水线，支持自动测试、自动构建 | ⚠️ CD 未做 |
| 12 | 安全可内建 | 从认证、输入验证、密钥管理建立安全基础 | ⚠️ 无车辆证书/mTLS |
| 13 | 压测可预留 | 当前不做压力测试，但预留监控、日志、配置可调能力 | ✅ |

**V2 目标：** 把 ⚠️ 项全部变成 ✅，通过阶段七~阶段十完成。

---

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

**核心差异：我们是调度平台，不是自动驾驶系统。**

---

## 三、接入与指令设计

### 3.1 接入数据分类

| 类别 | 内容 | 频率 | V1 状态 |
|---|---|---|---|
| 车辆状态 | 位置、速度、航向、电量、状态、能力 | 高频（1-10Hz） | ✅ 1Hz |
| **任务请求** | 起点、终点、时间窗、类型、优先级 | 低频（按需） | ❌ **阶段七** |
| **环境数据** | 路况、天气、事件、拥堵 | 中频（1-60s） | ❌ **阶段七** |
| **心跳** | 在线状态、健康状态 | 低频（10-60s） | ❌ **阶段七** |
| **事件** | 异常、告警、完成、取消 | 事件驱动 | ⚠️ 只做异常，**阶段七补完成/取消** |

### 3.2 指令数据分类

| 指令类型 | 内容 | 方向 | V1 状态 |
|---|---|---|---|
| 调度指令 | 车辆去某地执行某任务 | 平台 → 外部系统 | ✅ |
| **取消指令** | 取消某任务 | 平台 → 外部系统 | ❌ **阶段七** |
| **重定位指令** | 车辆前往某区域待命 | 平台 → 外部系统 | ❌ **阶段七** |
| 充电指令 | 车辆前往充电桩 | 平台 → 外部系统 | ✅ |
| **维护指令** | 车辆前往维护站 | 平台 → 外部系统 | ❌ **阶段七** |
| **紧急指令** | 紧急优先级任务 | 平台 → 外部系统 | ❌ **阶段七** |
| **查询指令** | 查询车辆状态 | 平台 → 外部系统 | ❌ **阶段七** |

### 3.3 接入协议设计

| 要点 | 说明 | V1 状态 |
|---|---|---|
| 协议无关 | 支持 MQTT/gRPC/HTTP，按合作方能力选 | ⚠️ 只有 MQTT，**阶段七补 gRPC/HTTP** |
| 契约优先 | 先定 Schema，再定传输 | ✅ |
| 版本化 | 契约有版本，兼容旧版本 | ✅ |
| 可扩展 | 新字段可加，不破坏旧版本 | ✅ |
| 可校验 | 接入层校验数据合法性 | ✅ |
| 可追溯 | 每条数据带来源、时间戳 | ✅ |

### 3.4 指令协议设计

| 要点 | 说明 | V1 状态 |
|---|---|---|
| 幂等 | 同一指令重复下发只执行一次 | ✅ |
| **确认** | 外部系统接收后返回确认 | ❌ **阶段七** |
| **超时** | 指令有超时时间 | ❌ **阶段七** |
| **过期** | 过期指令不执行 | ⚠️ 签名有 TTL，**阶段七补指令 TTL** |
| 签名 | 指令带签名，防伪造 | ✅ |
| 审计 | 指令下发记录审计 | ✅ |
| **回滚** | 指令可撤销 | ❌ **阶段七** |

### 3.5 没有合作方时的处理

**定义标准接入协议，用模拟器产生符合协议的数据。** ✅

### 3.6 参考的行业标准

| 标准 | 用途 | V1 状态 |
|---|---|---|
| MQTT | 车辆状态上报 | ✅ |
| **gRPC / HTTP** | 任务请求、控制指令 | ❌ **阶段七** |
| Protobuf / JSON Schema | 数据契约 | ⚠️ 只用 JSON |
| **V2X BSM** | 车辆基本安全消息 | ❌ 未参考 |
| **Apollo / Autoware 消息格式** | 自动驾驶消息参考 | ❌ 未参考 |
| **GB/T 国标** | 国内自动驾驶数据标准 | ❌ 未参考 |

### 3.7 模拟器要模拟什么

| 模拟内容 | V1 状态 |
|---|---|
| 车辆状态 | ✅ |
| **任务响应** | ❌ **阶段七** |
| **异常事件** | ❌ **阶段七** |
| **网络行为（断连/延迟/重传）** | ❌ **阶段七** |
| **协议行为（gRPC/HTTP）** | ❌ **阶段七** |

---

## 四、核心与插件划分

### 4.1 划分标准

| 类别 | 判定标准 | 启动策略 | 修改频率 |
|---|---|---|---|
| 核心 | 维持系统运行的基础功能 | 每次全启 | 冻结，仅维护 |
| 插件 | 附加功能，少了系统仍可运行 | 按 profile 选择 | 自由迭代 |

### 4.2 核心服务清单

10 个核心服务，V1 全部实现 ✅。

| 序号 | 服务 | 职责 |
|---|---|---|
| 1 | infra | 消息总线/PG/EMQX/Redis/监控 编排 |
| 2 | gateway | HTTP 统一入口 |
| 3 | plugin-host | 插件宿主（进程内扩展） |
| 4 | libs | 共享库 |
| 5 | ingest | MQTT 出入口 |
| 6 | data-writer | 统一写库 |
| 7 | simulator | 模拟数据源（500 辆模拟） |
| 8 | dispatch-core | 调度核心（算法可插拔） |
| 9 | observability | 监控 + 日志 + 追踪 |
| 10 | registry | 预生成注册表 |

**V2 新增：** 11 个核心服务，**加 aggregator**。

| 序号 | 服务 | 职责 |
|---|---|---|
| **11** | **aggregator** | **聚合器（raw → aggregated）** |

### 4.3 插件清单

11 个插件，V1 实现 9 个 ✅，2 个未做。

| 插件 | 作用 | V1 状态 |
|---|---|---|
| nearest-dispatch | 最近邻调度 | ✅ |
| batch-match | 批量匹配 | ✅ |
| priority-dispatch | 优先级调度 | ✅ |
| geofence | 地理围栏 | ✅ |
| anomaly | 异常检测 | ✅ |
| dashboard | 仪表板前端 | ✅ |
| charging-scheduler | 充电调度 | ✅ |
| route-optimizer | 路线优化 | ✅ |
| reporting | 报表导出 | ✅ |
| **real-data-source** | **接入真实车辆** | ❌ **阶段七** |
| **message-push** | **消息推送** | ❌ **阶段七** |

---

## 五、插件进程内扩展设计

✅ V1 全部实现。

**V2 补强（阶段十）：**

| 项 | V1 状态 | V2 目标 |
|---|---|---|
| 命名空间隔离 | 只用 pluginId 日志前缀 | **模块级隔离** |
| 版本隔离 | 无运行时检查 | **core_version 兼容性检查** |
| **插件签名** | 无 | **阶段十** |
| **插件权限声明** | 无 | **阶段十** |

---

## 六、服务与层数分离

| 规划项 | V1 状态 |
|---|---|
| 服务与层分离 | ✅ |
| 单层部署 | ✅ |
| 三层配置预留 | ✅ |
| 加层只改配置 | ✅ |
| **多层实际部署验证** | ❌ **阶段十一** |
| **层间通信协议** | ❌ **阶段十一** |
| **层间一致性** | ❌ **阶段十一** |
| **跨层追踪** | ❌ **阶段十一** |

---

## 七、调度算法设计

### 7.1 调度对象定义

- 任务定义：✅ 有 `DispatchTask`
- **`constraints` 字段**：⚠️ 声明了但未使用（**阶段十二**）
- **`service_level` 字段**：⚠️ 声明了但未使用（**阶段十二**）

### 7.2 目标函数

| 目标 | V1 状态 |
|---|---|
| 最小化乘客等待时间 | ⚠️ 部分（用距离代替 ETA） |
| **最大化订单完成率** | ❌ **阶段十二** |
| **最小化空驶率** | ❌ **阶段十二** |
| **最大化供需匹配率** | ❌ **阶段十二** |

### 7.3 硬约束

| 约束 | V1 状态 |
|---|---|
| 续航约束 | ✅ |
| 时间窗约束 | ✅ |
| 服务能力约束 | ✅ |
| 地理约束 | ✅ |
| **法规约束** | ❌ **阶段十二** |
| 状态约束 | ✅ |

### 7.4 调度流程

✅ 全部实现。

### 7.5 算法插件化

✅ 3 个算法全部实现。

### 7.6 算法规格

| 算法 | V1 状态 |
|---|---|
| nearest | ✅ |
| **batch-match（匈牙利算法 / 最小成本流）** | ⚠️ 实际是单任务多因素打分，**阶段十二补真正的批量匹配** |
| **priority-dispatch（优先级队列 + 抢占）** | ⚠️ 实际是动态权重，**阶段十二补真正的优先级队列 + 抢占** |

### 7.7 算法选择

| 场景 | V1 状态 |
|---|---|
| 实时单 → 最近邻 | ✅ |
| **预约单 → 批量匹配** | ⚠️ 无预约单机制（**阶段十二**） |
| **紧急任务 → 优先级调度** | ⚠️ 无紧急任务机制（**阶段十二**） |

### 7.8 dispatch-core 与算法插件

| 角色 | V1 状态 |
|---|---|
| 任务接收、约束过滤、算法调度、结果下发、签名 | ✅ |
| **多算法协作（串行/并行）** | ❌ **阶段十二** |
| **算法切换（运行时）** | ❌ **阶段十二** |
| 算法回退 | ✅ |

---

## 八、消息总线与多媒介

### 8.1 消息总线抽象

| 接口 | V1 状态 |
|---|---|
| connect / publish / subscribe / commit / health / close | ✅ |
| 适配器：Memory / MQTT / Kafka | ✅ |
| **Pulsar / NATS / Redis / S3** | ❌ **阶段十三** |

### 8.2 数据流媒介

✅ MQTT + Kafka 两段。

**V2 新增：多媒介分段**（**阶段十三**）

| 段 | 媒介 | 理由 |
|---|---|---|
| 外部 → 接入 | MQTT | 长连接 |
| 内部高频 | Kafka | 可靠 |
| **内部实时 < 50ms** | **Redis Pub/Sub** | **低延迟（阶段十三）** |
| **内部超高频** | **NATS** | **轻量（阶段十三）** |
| **冷数据** | **S3/MinIO** | **低成本（阶段十三）** |

### 8.3 切换媒介

✅ 改配置即可。

---

## 九、监控、日志、追踪

### 9.1 监控体系

| 层级 | V1 状态 |
|---|---|
| 插件 | ✅ |
| 服务 | ✅ |
| 数据流 | ✅ |
| 消息总线 | ⚠️ 指标有，**未实机验证（阶段八）** |
| **存储（PG/Redis）** | ❌ **阶段八** |
| **系统（全局）** | ❌ **阶段八** |

### 9.2 日志体系

| 日志类型 | V1 状态 |
|---|---|
| 应用日志 | ✅ |
| 插件日志 | ✅ |
| **数据流日志** | ⚠️ 有指标，日志未接 Loki（**阶段八**） |
| 错误日志 | ✅ |
| **性能日志** | ❌ **阶段八** |

### 9.3 追踪预留

✅ trace_id / span_id 预留。

**V2 新增：接入 OpenTelemetry + Jaeger**（**阶段八**）

### 9.4 监控工具

| 工具 | V1 状态 |
|---|---|
| Prometheus | ✅ |
| Grafana | ✅ |
| **Loki** | ⚠️ 配置在，**无 Promtail 采集（阶段八）** |

---

## 十、CI/CD 流水线

### 10.1 CI 要做的事

| 阶段 | V1 状态 |
|---|---|
| 代码检查 | ✅ |
| 单元测试 | ✅ |
| **集成测试（testcontainers）** | ❌ **阶段九** |
| **构建服务和插件镜像** | ❌ **阶段九** |
| **推送镜像仓库** | ❌ **阶段九** |

### 10.2 缓存加速

| 项 | V1 状态 |
|---|---|
| 缓存 Node.js 依赖 | ✅ |
| **缓存 Docker 层** | ❌ **阶段九** |
| 缓存构建产物 | ⚠️ 部分 |
| **缓存测试容器镜像** | ❌ **阶段九** |

### 10.3 插件相关

| 项 | V1 状态 |
|---|---|
| 验证插件能被 plugin-host 加载 | ✅ |
| **验证插件与核心兼容性（core_version）** | ❌ **阶段九** |
| 验证 registry 生成正确 | ✅ |

### 10.4 CD 相关

| 项 | V1 状态 |
|---|---|
| **手动部署到生产** | ❌ **阶段九** |
| **按 profile 部署** | ⚠️ 有脚本，无正式流程（**阶段九**） |
| **按层组合部署** | ❌ **阶段九** |
| **部署后自动冒烟测试** | ❌ **阶段九** |

### 10.5 安全集成

✅ gitleaks + pnpm audit。

---

## 十一、安全性设计

### 11.1 身份与认证

| 对象 | V1 状态 |
|---|---|
| **车辆（证书 + 设备指纹）** | ❌ **阶段十** |
| 服务（基础认证） | ✅ |
| 用户（JWT） | ✅ |
| **插件（权限声明）** | ❌ **阶段十** |

### 11.2 输入验证

| 项 | V1 状态 |
|---|---|
| 所有入口校验输入 | ✅ |
| 防注入 | ✅ |
| 防重放 | ✅ |
| 防篡改 | ✅ |
| 限流 | ✅ 内存版 |
| **熔断** | ❌ **阶段十** |

### 11.3 密钥管理

| 项 | V1 状态 |
|---|---|
| 环境变量或 Secrets Manager | ✅ |
| 不硬编码 | ✅ |
| **密钥轮换** | ❌ **阶段十** |
| **最小权限密钥** | ❌ **阶段十** |

### 11.4 指令安全

| 项 | V1 状态 |
|---|---|
| 签名 | ✅ |
| **超时** | ❌ **阶段七** |
| 幂等 | ✅ |
| 审计 | ✅ |

### 11.5 数据安全

| 项 | V1 状态 |
|---|---|
| **敏感数据加密存储** | ❌ **阶段十** |
| **传输加密** | ❌ **阶段十** |
| **访问控制（RBAC）** | ❌ **阶段十** |

---

## 十二、压力测试策略

计划书说"当前不做，预留能力"。

| 预留项 | V1 状态 |
|---|---|
| 监控指标 | ✅ |
| 日志格式 | ✅ |
| 配置外置 | ✅ |
| 模拟器可调 | ✅ |
| 层配置可调 | ✅ |
| 消息总线可切换 | ✅ |
| 插件懒加载 | ✅ |

**预留全部到位 ✅。** 实际压测见**阶段十一**。

---

## 十三、项目结构图

```
ApisCloud/
│
├── core/                                    # 核心（与层无关）
│   ├── libs/                                # 共享库
│   ├── plugin-host/                         # 插件宿主
│   ├── registry/                            # 预生成注册表
│   └── services/                            # 核心服务（11 个）
│       ├── observability/
│       ├── simulator/
│       ├── ingest/
│       ├── data-writer/
│       ├── dispatch-core/
│       ├── aggregator/                      # V2 新增
│       └── gateway/
│
├── shared/                                  # 层共享
│   ├── message-bus/
│   ├── layer-config/
│   ├── contracts/
│   └── types/
│
├── plugins/                                 # 插件（进程内）
│   ├── _template/
│   ├── dispatch/
│   │   ├── nearest/
│   │   ├── batch-match/
│   │   └── priority-dispatch/
│   ├── geofence/
│   ├── anomaly/
│   ├── dashboard/
│   ├── charging-scheduler/
│   ├── route-optimizer/
│   ├── reporting/
│   ├── real-data-source/                    # V2 新增（阶段七）
│   └── message-push/                        # V2 新增（阶段七）
│
├── web/                                     # 前端外壳
│
├── monitor/                                 # 监控配置
│   ├── prometheus/
│   ├── grafana/
│   ├── loki/
│   └── promtail/                            # V2 新增（阶段八）
│
├── deploy/
│   ├── postgres/
│   ├── redis/
│   ├── emqx/
│   ├── single-layer/
│   ├── multi-layer/
│   ├── k8s/                                 # V2 新增（阶段九）
│   └── docker/                              # V2 新增（阶段九）
│
├── scripts/
│   ├── start.sh
│   ├── dev-up.sh
│   ├── dev-down.sh
│   ├── dev-status.sh
│   ├── test.sh
│   ├── verify-e2e.sh
│   ├── verify-multi-scale.sh
│   ├── build-registry.js
│   ├── check-registry.js
│   └── init-kafka-topics.js
│
├── tests/
│   ├── helpers/
│   ├── *.test.ts
│   ├── integration.*.test.ts
│   └── e2e.*.test.ts
│
├── docs/
│   └── (每个功能一个文档)
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── security.yml
│       └── cd.yml                           # V2 新增（阶段九）
│
├── Makefile
├── docker-compose.infra.yml
├── docker-compose.app.yml                   # V2 新增（阶段九）
└── README.md
```

---

## 十四、数据流向图

✅ 与 V1 一致，V2 数据流：

```
外部系统 ──MQTT/gRPC/HTTP──→ EMQX / API ──→ ingest ──→ telemetry.raw
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

外部系统 ACK ──→ ingest → events.commands.ack ──→ data-writer → 更新 dispatch_commands.status
```

**V2 新增的 ACK 回传路径（阶段七）。**

---

## 十五、文档规范

✅ V1 一致。

**V2 补强：** 删除被替代的旧版本（如 `architecture.V1.md`）。

---

## 十六、测试规范

### 16.1 命名规则

✅ 遵守。

### 16.2 层级区分

✅ 三层。

### 16.3 测试命令

| 命令 | V1 状态 |
|---|---|
| `make test` | ✅ |
| `make test-unit` | ✅ |
| `make test-integration` | ✅ |
| `make test-e2e` | ✅ |
| `make test-coverage` | ✅ |
| **`make test dispatch`** | ❌ **阶段八** |
| **`make test plugins`** | ❌ **阶段八** |
| **`make test messageBus`** | ❌ **阶段八** |
| **`make test layerConfig`** | ❌ **阶段八** |

---

## 十七、消息总线性能策略

| 方案 | V1 状态 |
|---|---|
| 主题分层 | ✅ |
| 选择性订阅 | ✅ |
| 共享消费者组 | ✅ |
| Redis 热路径 | ✅ |
| **批量消费（max.poll.records）** | ❌ **阶段八** |
| 按车辆分区 | ✅ |
| 插件懒订阅 | ✅ |
| 总线可切换 | ✅ |

---

## 十八、项目阶段划分

### 阶段一~六（V1 已完成）✅

| 阶段 | 内容 | 状态 |
|---|---|---|
| 阶段一 | 基础设施与共享库 | ✅ |
| 阶段二 | 核心数据流服务 | ✅ |
| 阶段三 | 核心业务服务与调度算法 | ✅ |
| 阶段四 | 插件系统与前端外壳 | ✅ |
| 阶段五 | 插件生态与性能优化 | ✅ |
| 阶段六 | 测试完善、部署与交付 | ✅ |

---

### 阶段七：接入能力完善（V2 新增）

**阶段目标：** 打通真实外部接入能力，让平台能对接真实自动驾驶系统。

**实现思路：**

- 补 gRPC / HTTP 接入，不只 MQTT。
- 补任务请求、心跳、环境数据接入。
- 补 ACK 机制、指令超时、指令过期、指令回滚。
- 补 5 种指令：取消、重定位、维护、紧急、查询。
- 补 simulator 任务响应、异常事件、网络行为。
- 补 real-data-source 插件、message-push 插件。

**具体任务：**

| 序号 | 任务 | 产出 |
|---|---|---|
| 7.1 | gRPC 接入 | `core/services/ingest/src/grpc-server.ts` |
| 7.2 | HTTP 接入 | `core/services/ingest/src/http-server.ts` |
| 7.3 | 任务请求接入 | `core/services/ingest/src/task-handler.ts` |
| 7.4 | 心跳 | `core/services/ingest/src/heartbeat-handler.ts` |
| 7.5 | 环境数据接入 | `core/services/ingest/src/env-handler.ts` |
| 7.6 | ACK 机制 | `events.commands.ack` 主题 + data-writer 更新 status |
| 7.7 | 指令超时/过期/回滚 | `core/services/dispatch-core/src/command-lifecycle.ts` |
| 7.8 | 5 种指令扩展 | `command_type` 加 5 种 |
| 7.9 | simulator 任务响应 | simulator 消费 MQTT 命令，更新状态 |
| 7.10 | simulator 异常事件 | simulator 上报异常 |
| 7.11 | simulator 网络行为 | 模拟断连/延迟/重传 |
| 7.12 | real-data-source 插件 | `plugins/real-data-source/` |
| 7.13 | message-push 插件 | `plugins/message-push/` |
| 7.14 | 端到端测试 | `tests/e2e.realIngest.test.ts` |
| 7.15 | 文档 | `docs/ingest.V2.md`、`docs/simulator.V2.md` |

**阶段验收：** gRPC / HTTP 接入可用，任务请求可提交，ACK 回传更新 status，5 种指令可用。

**阶段文档：**

- `docs/ingest.V2.md`
- `docs/simulator.V2.md`
- `docs/dispatchCore.V2.md`
- `docs/realDataSource.V1.md`
- `docs/messagePush.V1.md`

---

### 阶段八：性能与可观测性完善（V2 新增）

**阶段目标：** 支撑 5000 辆规模，日志进 Loki，追踪接 OpenTelemetry。

**实现思路：**

- data-writer 消费性能优化：Redis hmset、PG 批量写、水平扩展。
- 批量消费（eachBatch）。
- Promtail 采集日志到 Loki。
- OpenTelemetry + Jaeger 接入。
- 存储指标（PG/Redis）、系统指标（全局）。
- 4 个测试过滤命令。
- 性能日志。

**具体任务：**

| 序号 | 任务 | 产出 |
|---|---|---|
| 8.1 | Redis hmset 合并 | `redis-writer.ts` 改 |
| 8.2 | PG 批量写 | `pg-writer.ts` 加攒批 |
| 8.3 | data-writer 水平扩展验证 | 6 分区 6 实例 |
| 8.4 | 批量消费 | `kafka.ts` 改 eachBatch |
| 8.5 | Promtail 采集 | `monitor/promtail/` |
| 8.6 | OpenTelemetry + Jaeger | `core/libs/src/tracing/` |
| 8.7 | 存储指标 | PG/Redis exporter |
| 8.8 | 系统指标 | 全局指标 |
| 8.9 | 4 个测试过滤命令 | `Makefile` 更新 |
| 8.10 | 性能日志 | 慢查询、慢消费 |
| 8.11 | 5000 辆规模压测 | `scripts/verify-multi-scale.sh` 跑 |
| 8.12 | 文档 | `docs/observability.V3.md`、`docs/busPerformance.V2.md` |

**阶段验收：** 5000 辆规模不积压，日志进 Loki，追踪链路完整。

**阶段文档：**

- `docs/dataWriter.V2.md`
- `docs/messageBus.V4.md`
- `docs/observability.V3.md`
- `docs/busPerformance.V2.md`
- `docs/testing.V2.md`

---

### 阶段九：生产部署与安全加固（V2 新增）

**阶段目标：** 具备生产部署能力，安全内建。

**实现思路：**

- 每个服务加 Dockerfile。
- CD 流水线：构建镜像、推送、部署。
- 按层组合部署。
- 部署后自动冒烟测试。
- 车辆证书 + 设备指纹认证。
- 插件权限声明 + 插件签名。
- mTLS。
- RBAC。
- 密钥轮换。
- 敏感数据加密存储。
- 传输加密。
- 熔断。
- Redis 版限流。
- 数据保留策略。
- 时序数据库。

**具体任务：**

| 序号 | 任务 | 产出 |
|---|---|---|
| 9.1 | 服务 Dockerfile | `core/services/*/Dockerfile` |
| 9.2 | docker-compose.app.yml | 完整应用编排 |
| 9.3 | CD 流水线 | `.github/workflows/cd.yml` |
| 9.4 | 按层组合部署 | `deploy/single-layer/`、`deploy/multi-layer/` |
| 9.5 | 部署后冒烟测试 | `scripts/smoke-test.sh` |
| 9.6 | 车辆证书认证 | `core/libs/src/security/vehicle-cert.ts` |
| 9.7 | 插件权限声明 | `plugin.json` 加 `permissions` |
| 9.8 | 插件签名 | `core/plugin-host/src/signature.ts` |
| 9.9 | mTLS | `core/libs/src/mtls/` |
| 9.10 | RBAC | `core/libs/src/security/rbac.ts` |
| 9.11 | 密钥轮换 | `core/libs/src/security/rotation.ts` |
| 9.12 | 敏感数据加密 | `core/services/data-writer/src/encryption.ts` |
| 9.13 | 传输加密 | HTTPS / TLS |
| 9.14 | 熔断 | `core/libs/src/resilience/circuit-breaker.ts` |
| 9.15 | Redis 版限流 | `core/libs/src/security/rate-limiter-redis.ts` |
| 9.16 | 数据保留策略 | `deploy/postgres/retention.sql` |
| 9.17 | 时序数据库 | TimescaleDB 或 ClickHouse |
| 9.18 | K8s 部署清单 | `deploy/k8s/` |
| 9.19 | 文档 | `docs/deployment.V2.md`、`docs/security.V3.md`、`docs/mtls.V1.md` |

**阶段验收：** 可 Docker 部署，CD 流水线可用，车辆证书 + mTLS + RBAC 完整。

**阶段文档：**

- `docs/deployment.V2.md`
- `docs/security.V3.md`
- `docs/mtls.V1.md`
- `docs/rbac.V1.md`
- `docs/k8s.V1.md`

---

### 阶段十：架构演进与规模化（V2 新增）

**阶段目标：** 支撑千万级规模，多集群部署，架构不推翻。

**实现思路：**

- 多层部署验证（单层 → 3 层 → 4 层）。
- 层间通信协议、层间一致性、跨层追踪。
- 多集群部署、跨集群路由、跨集群一致性、跨集群监控、跨集群追踪、故障切换。
- 多算法协作（串行/并行投票）。
- 算法运行时切换。
- 目标函数补全（完成率、空驶率、供需匹配率）。
- batch-match 真正的匈牙利算法。
- priority-dispatch 真正的优先级队列 + 抢占。
- constraints / service_level 实际使用。
- 法规约束。
- Pulsar / NATS / Redis / S3 适配器。
- 多媒介分段。
- 100 万 / 1000 万规模压测。

**具体任务：**

| 序号 | 任务 | 产出 |
|---|---|---|
| 10.1 | 多层部署验证 | `scripts/verify-multi-layer.sh` |
| 10.2 | 层间通信协议 | `shared/layer-comm/` |
| 10.3 | 层间一致性 | `shared/layer-consistency/` |
| 10.4 | 跨层追踪 | `shared/layer-tracing/` |
| 10.5 | 多集群部署 | `deploy/cluster-east/`、`deploy/cluster-west/` |
| 10.6 | 跨集群路由 | `core/gateway/src/cluster-routing.ts` |
| 10.7 | 跨集群一致性 | `shared/cluster-consistency/` |
| 10.8 | 跨集群监控 | `monitor/cluster/` |
| 10.9 | 跨集群追踪 | `shared/cluster-tracing/` |
| 10.10 | 故障切换 | `core/libs/src/resilience/failover.ts` |
| 10.11 | 多算法协作 | `core/services/dispatch-core/src/algorithm-coordinator.ts` |
| 10.12 | 算法运行时切换 | `algorithm-registry.ts` 支持热切换 |
| 10.13 | 目标函数补全 | `objective.ts` 加 3 个目标 |
| 10.14 | batch-match 匈牙利算法 | `plugins/dispatch/batch-match/src/index.js` 重写 |
| 10.15 | priority-dispatch 优先级队列 + 抢占 | `plugins/dispatch/priority-dispatch/src/index.js` 重写 |
| 10.16 | constraints / service_level 使用 | `constraints.ts` 补 |
| 10.17 | 法规约束 | `constraints.ts` 加 |
| 10.18 | Pulsar 适配器 | `shared/message-bus/adapters/pulsar.ts` |
| 10.19 | NATS 适配器 | `shared/message-bus/adapters/nats.ts` |
| 10.20 | Redis 适配器 | `shared/message-bus/adapters/redis.ts` |
| 10.21 | S3 适配器 | `shared/message-bus/adapters/s3.ts` |
| 10.22 | 多媒介分段 | `shared/dataflow/` |
| 10.23 | 100 万规模压测 | 对比实验 |
| 10.24 | 1000 万规模压测 | 对比实验 |
| 10.25 | 文档 | `docs/architecture.V3.md`、`docs/multiCluster.V1.md`、`docs/multiMedia.V1.md` |

**阶段验收：** 千万级规模跑通，多集群部署可用，多媒介切换零改动。

**阶段文档：**

- `docs/architecture.V3.md`
- `docs/layerConfig.V4.md`
- `docs/messageBus.V5.md`
- `docs/multiCluster.V1.md`
- `docs/multiMedia.V1.md`
- `docs/dispatchCore.V3.md`
- `docs/security.V4.md`

---

## 十九、项目里程碑

| 里程碑 | 阶段 | 产出 | 验收标准 |
|---|---|---|---|
| M1 | 阶段一 | 基础设施 + 共享库 | ✅ 已达成 |
| M2 | 阶段二 | 数据流主干 | ✅ 已达成 |
| M3 | 阶段三 | 基础业务 + 调度算法 | ✅ 已达成 |
| M4 | 阶段四 | 插件系统 + 前端 | ✅ 已达成 |
| M5 | 阶段五 | 插件生态 + 性能 | ✅ 已达成 |
| M6 | 阶段六 | 测试 + 可观测性 + 安全 + 部署 + 交付 | ✅ 已达成 |
| **M7** | **阶段七** | **接入能力完善** | **gRPC/HTTP 接入、任务请求、ACK、5 种指令可用** |
| **M8** | **阶段八** | **性能与可观测性完善** | **5000 辆不积压，日志进 Loki，OTel 追踪** |
| **M9** | **阶段九** | **生产部署与安全加固** | **Docker 部署、CD 流水线、车辆证书、mTLS、RBAC** |
| **M10** | **阶段十** | **架构演进与规模化** | **千万级规模、多集群、多媒介** |

---

## 二十、总结

本项目 V2 以"**六阶段闭环已完成，四阶段演进接续**"为总原则：

### V1（阶段一~六）已完成

- **定位**：智能驾驶服务调度平台。
- **核心**：11 个基础服务（含 aggregator），每次全启，冻结维护。
- **插件**：进程内扩展，按 profile 选择，即插即用，自由迭代。
- **前端**：Vite + React 18 + TypeScript + TailwindCSS。
- **数据流**：唯一规则，只有 Ingest 连外部，只有 Data-Writer 连库。
- **性能**：主题分层 + 选择性订阅 + Redis 热路径。
- **测试**：75 个 suite，557 个用例；端到端 17/17 通过。
- **文档**：30+ 个文档。
- **总线**：消息总线抽象层，支持 MQTT/Kafka/Memory。
- **调度**：3 个算法插件。
- **可观测性**：5 层指标 + Grafana 仪表板。
- **CI/CD**：GitHub Actions。
- **安全**：认证、输入验证、密钥管理、指令签名。

### V2（阶段七~十）待做

| 阶段 | 目标 | 关键产出 |
|---|---|---|
| **阶段七** | **接入能力完善** | gRPC/HTTP、任务请求、ACK、5 种指令、real-data-source、message-push |
| **阶段八** | **性能与可观测性** | 5000 辆规模、Promtail、OpenTelemetry、批量消费 |
| **阶段九** | **生产部署与安全** | Docker 镜像、CD、车辆证书、mTLS、RBAC、熔断、密钥轮换 |
| **阶段十** | **架构演进与规模化** | 千万级、多集群、多媒介、多算法协作、真正批量匹配 |

**V2 完成后，系统从"演示级"升级为"生产级"。**

---

**文档版本：** destination.V2
**对应状态：** 阶段一~六完成，阶段七~十未开始