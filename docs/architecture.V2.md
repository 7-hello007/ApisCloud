# 系统架构 V2

> V2 相比 V1，补充阶段二已实现的 simulator、ingest、data-writer 三个核心服务，数据流从"预留"变成"已实现"。

## 一、功能目标

定义 ApisCloud - 蜂云智能驾驶服务调度系统的总体架构，明确分层、服务、数据流、契约。

**系统定位：** 接入外部自动驾驶系统上报的数据，处理后做调度决策，下发指令给外部系统。

- 我们做：接入数据、处理数据、调度决策、下发指令。
- 我们不做：不采集原始传感器数据、不控制车辆、不负责车辆安全。

---

## 二、基础实现

### 2.1 总体架构

**插件化微服务架构 + 事件驱动架构 + 分层部署架构。**

| 层面 | 架构模式 | 说明 |
|---|---|---|
| 整体结构 | 插件化微服务 | 核心服务 + 插件，独立部署，独立演进 |
| 通信方式 | 事件驱动 | 服务之间通过消息总线通信，不直接调用 |
| 扩展方式 | 插件化 | 新增功能 = 新增插件目录 + plugin.json |
| 部署形态 | 分层部署 | 服务与层分离，层是配置，可单层可多层 |
| 前端形态 | 微前端 | 前端外壳 + 插件前端模块动态加载 |

**核心特征：**

- 核心服务每次全启，冻结维护。
- 插件按 profile 选择启动，自由迭代。
- 数据流单一：外部 → Ingest → 消息总线 → 业务服务 → 消息总线 → Data-Writer → 存储。
- 只有 Ingest 连外部，只有 Data-Writer 连库。
- 服务之间零直接调用，只通过消息总线。
- 消息总线可切换，不绑定 Kafka。

### 2.2 核心服务

10 个核心服务，每次全启，冻结维护。

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

**核心服务实现状态**：

| 序号 | 服务 | 状态 | 说明 |
|---|---|---|---|
| 1 | infra | ✅ 已实现 | Docker Compose 编排 |
| 2 | gateway | ⬜ 待实现 | 阶段四 |
| 3 | plugin-host | ✅ 已实现 | 阶段一 |
| 4 | libs | ✅ 已实现 | 阶段一 |
| 5 | ingest | ✅ 已实现 | 阶段二 |
| 6 | data-writer | ✅ 已实现 | 阶段二 |
| 7 | simulator | ✅ 已实现 | 阶段二 |
| 8 | dispatch-core | ⬜ 待实现 | 阶段三 |
| 9 | observability | ✅ 已实现 | 阶段一 |
| 10 | registry | ✅ 已实现 | 阶段一 |

### 2.3 服务与层分离

**服务是逻辑单元，层是部署单元。同一服务可以在任意层部署，代码不变。**

| 概念 | 定义 |
|---|---|
| 服务 | 逻辑功能，如 dispatch-core、ingest、data-writer |
| 层 | 部署位置，如接入层、处理层、决策层 |
| 服务实例 | 服务在某一层的具体运行实例 |
| 层配置 | 声明某层启用哪些服务 |

当前阶段只部署单层，所有服务集中运行。层配置预留三层结构，未来按需启用。

### 2.4 数据流

唯一规则：

- 只有 Ingest 连外部
- 只有 Data-Writer 连库
- 服务之间零直接调用，只通过消息总线

```
┌──────────────────┐
│  外部自动驾驶系统  │
│  (或模拟器替身)   │
└────────┬─────────┘
         │ MQTT / gRPC / HTTP
         ▼
┌──────────────┐
│    EMQX      │
│  MQTT Broker │
└──────┬───────┘
       │ 订阅
       ▼
┌──────────────┐
│   Ingest     │  ← 唯一外部出入口
└──────┬───────┘
       │ 发布
       ▼
┌──────────────────────────────────────────────┐
│        消息总线（可切换）                      │
│  telemetry.raw / telemetry.aggregated        │
│  events.commands / events.alerts             │
└──────┬───────────────────────────────────────┘
       │
       ├──────────────┬──────────────┬──────────────┐
       ▼              ▼              ▼              ▼
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│Dispatch  │   │ Geofence │   │ Anomaly  │   │ 插件们   │
│Core      │   │ (插件)   │   │ (插件)   │   │(进程内)  │
└────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │              │
     │ commands     │ alerts       │ alerts       │
     ▼              ▼              ▼              ▼
┌──────────────────────────────────────────────┐
│        消息总线（可切换）                      │
│         events.commands / events.alerts       │
└──────┬───────────────────────────────────────┘
       │
       ├──────────────────────┐
       ▼                      ▼
┌──────────────┐       ┌──────────────┐
│   Ingest     │       │ Data-Writer  │
│  → MQTT 下行 │       │              │
└──────┬───────┘       └──────┬───────┘
       │                      │
       ▼                      ├──────────────┐
┌──────────────┐              ▼              ▼
│    EMQX      │       ┌──────────┐   ┌──────────┐
│  → 外部系统  │       │PostgreSQL│   │  Redis   │
└──────────────┘       │ (持久化) │   │ (热路径) │
                       └──────────┘   └────┬─────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │  业务查询     │
                                    │ (O(1) 读)    │
                                    └──────────────┘
```

**已实现的数据流（阶段二）**：

- simulator → MQTT `telemetry/raw` → ingest
- ingest → 总线 `telemetry.raw` → data-writer
- data-writer → PG `vehicle_latest`、`vehicle_telemetry`、`alerts`
- data-writer → Redis 热路径

**未实现的数据流（阶段三及以后）**：

- dispatch-core → 总线 `events.commands` → ingest → MQTT 下行
- geofence、anomaly → 总线 `events.alerts` → data-writer

### 2.5 消息总线抽象

业务代码只依赖统一接口，不依赖 Kafka SDK。

| 接口 | 作用 |
|---|---|
| connect | 连接总线 |
| publish | 发布消息 |
| subscribe | 订阅消息 |
| commit | 提交消费位点 |
| health | 健康检查 |
| close | 关闭总线 |

适配器：

| 适配器 | 媒介 |
|---|---|
| MemoryAdapter | 内存（测试） |
| MqttAdapter | MQTT（外部接入） |
| KafkaAdapter | Kafka（内部事件流） |

改配置 `MESSAGE_BUS=kafka` → `MESSAGE_BUS=memory`，业务代码零改动。

**4 个主题**：

| 主题 | 分区数 | 保留 | 说明 |
|---|---|---|---|
| telemetry.raw | 6 | 6h | 原始遥测，高频 |
| telemetry.aggregated | 3 | 72h | 聚合遥测，低频 |
| events.commands | 3 | 7d | 调度指令 |
| events.alerts | 3 | 7d | 告警事件 |

主题初始化脚本：`scripts/init-kafka-topics.js`，Makefile 命令 `make init-topics`。

### 2.6 核心契约

以下契约一旦定下，属于核心契约，破坏性改动需版本化。

| 契约 | 内容 |
|---|---|
| 消息格式 | Envelope 结构：id、topic、source、timestamp、trace_id、span_id、version、payload |
| 主题命名 | `telemetry.raw`、`telemetry.aggregated`、`events.commands`、`events.alerts` |
| 数据库表结构 | `vehicle_latest`、`vehicle_telemetry`、`alerts`、`dispatch_commands` |
| plugin.json 规范 | 插件声明的字段：name、version、core、profile、lazy、dependsOn、topics、routes、frontend |
| registry.json 格式 | 注册表结构：version、services、plugins、byProfile、topologicalOrder、stats |
| API 接口 | 服务的 HTTP 接口 |
| 前端插件协议 | 前端模块的导出格式 |
| layers.yml 格式 | 层配置结构：version、layers[].name、layers[].services |

**兼容性改动可加字段、加主题、加表；破坏性改动必须版本化、加适配层、保留废弃周期。**

### 2.7 插件化

**进程内插件扩展，即插即用。**

| 机制 | 作用 |
|---|---|
| plugin.json 声明 | 每个插件声明自己的依赖、路由、前端、profile |
| registry.json 预生成 | 启动时不扫文件系统，O(1) 加载 |
| plugin-host 自动装配 | 读取 registry，拓扑排序，加载插件 |
| 网关路由动态注入 | 插件启动后自动注册路由到 gateway |
| 前端动态 import | 插件前端模块按需加载，导航自动生成 |
| profile 过滤 | 不同场景启动不同插件组合 |

新增插件只做：

1. 放目录 + 写 `plugin.json` + 写业务代码
2. 运行 `make build-registry`
3. 启动时按 profile 自动加载

**核心代码零改动，网关零改动，前端外壳零改动。**

### 2.8 基础设施

用 Docker Compose 编排：

| 服务 | 用途 |
|---|---|
| PostgreSQL 16 | 持久化 |
| Redis 7 | 热路径 |
| EMQX 5.8 | MQTT Broker |
| Kafka 3.7（KRaft） | 内部事件流 |
| Prometheus 2.54 | 指标采集 |
| Loki 3.1 | 日志聚合 |
| Grafana 11.2 | 可视化 |

一键启动：`make infra-up`。

**阶段二已实现的核心服务**：

| 服务 | 端口 | 依赖 |
|---|---|---|
| simulator | 9107 | MQTT、总线（可选） |
| ingest | 9103 | MQTT、总线 |
| data-writer | 9104 | 总线、PG、Redis |
| observability | 9106 | 无 |

### 2.9 可观测性

覆盖插件、服务、数据流三层。

| 层 | 监控对象 | 指标 |
|---|---|---|
| 插件 | 每个插件 | 调用次数、延迟、错误率 |
| 服务 | 每个服务 | QPS、延迟、错误率、饱和度 |
| 数据流 | 每段数据流 | 吞吐、延迟、积压、丢失 |
| 消息总线 | 每个总线 | 生产/消费速率、分区、消费者组 |
| 存储 | PG/Redis | 连接、查询、命中率、容量 |
| 系统 | 全局 | 总车辆、总消息、总服务、总告警 |

日志统一 pino JSON，字段含 `trace_id`、`span_id`、`service`、`plugin`、`layer`。追踪预留字段，未来接 OpenTelemetry + Jaeger 零改动。

**阶段二已实现的健康检查**：

| 服务 | 健康检查项 |
|---|---|
| simulator | self、mqtt、fleet |
| ingest | self、mqtt、bus |
| data-writer | self、bus、pg、redis |

### 2.10 安全

从认证、输入验证、密钥管理建立安全基础。

| 对象 | 认证方式 |
|---|---|
| 车辆 | 证书 + 设备指纹（预留） |
| 服务 | 基础认证 |
| 用户 | JWT |
| 插件 | 权限声明（预留） |

- 所有入口用 zod 校验输入。
- 不在代码中硬编码密钥。
- 使用环境变量或 Secrets Manager。
- gitleaks 扫描硬编码密钥。
- 调度指令带签名（预留）。

**阶段二已实现的输入校验**：

- ingest 上行遥测用 zod schema 校验：`vehicle_id`、`ts`、`lat`、`lng`、`speed`、`battery`、`heading`、`status`。
- ingest 下行命令用 zod schema 校验：`vehicle_id`、`command_id`、`command_type`、`payload`。
- 复用 `@apiscloud/libs` 的 `VehicleId`、`Latitude`、`Longitude`、`Battery` schema。

### 2.11 CI/CD

GitHub Actions 流水线：

| Job | 作用 |
|---|---|
| lint | ESLint + Prettier |
| typecheck | `tsc -b` 全项目类型检查 |
| test-unit | Jest 单测 + 覆盖率 |
| build | `pnpm -r build` |
| registry-check | 验证 registry 合法 |
| security-scan | gitleaks + pnpm audit |
| ci-success | 汇总，用于分支保护 |

依赖更新：Dependabot 每周一提 PR。

### 2.12 核心原则

1. **核心稳定冻结**，插件自由迭代。
2. **新增功能优先加插件**，不改核心。
3. **服务与层分离**，加层只改配置，代码零改动。
4. **消息总线可切换**，只改配置，业务代码零改动。
5. **兼容性改动可加字段**，破坏性改动必须版本化。
6. **当前单层单集群**，未来按需扩展。
7. **压测当前不做**，预留监控、日志、配置可调能力。
8. **安全内建**，不是事后补。

---

## 三、V1 修改

无（首版）。

---

## 四、V2 修改

### 变更一：补充阶段二三个核心服务的实现

阶段二实现了 simulator、ingest、data-writer 三个核心服务。

**simulator**：

- 文件位置：`core/services/simulator/`
- 状态机 + GPS 生成器 + 500 辆模拟车
- 通过 MQTT 上报到 `telemetry/raw`
- 暴露 `/metrics`（9107）和 `/health`（9107）
- 配置项：`SIMULATOR_VEHICLE_COUNT`、`SIMULATOR_PUBLISH_INTERVAL_MS` 等

**ingest**：

- 文件位置：`core/services/ingest/`
- 上行：订阅 MQTT `telemetry/raw` → 校验 → Envelope → 总线 `telemetry.raw`
- 下行：订阅总线 `events.commands` → 校验 → MQTT `commands/{vehicle_id}`
- 暴露 `/metrics`（9103）和 `/health`（9103）
- 可注入依赖，便于测试

**data-writer**：

- 文件位置：`core/services/data-writer/`
- 订阅总线 `telemetry.raw`、`telemetry.aggregated`、`events.alerts`
- 写 PG：`vehicle_latest`（UPSERT）、`vehicle_telemetry`（INSERT）、`alerts`（INSERT）
- 写 Redis：`vehicle:{id}:latest`、`vehicles:active`、`alerts:recent`、`region:{region}:stats`
- 暴露 `/metrics`（9104）和 `/health`（9104）
- 可注入依赖，便于测试

### 变更二：补充消息总线主题的分区数和保留策略

阶段一已定义 4 个主题常量，V2 明确 Kafka 层面的配置：

| 主题 | 分区数 | 保留 | 理由 |
|---|---|---|---|
| telemetry.raw | 6 | 6h | 高频，短期保留 |
| telemetry.aggregated | 3 | 72h | 聚合数据，中期保留 |
| events.commands | 3 | 7d | 指令审计需要追溯 |
| events.alerts | 3 | 7d | 告警追溯 |

对应脚本：`scripts/init-kafka-topics.js`，Makefile 命令 `make init-topics`。

### 变更三：补充 MQTT topic 与总线 topic 的映射

| MQTT topic | 总线 topic | 方向 | 处理 |
|---|---|---|---|
| telemetry/raw | telemetry.raw | 上行 | ingest 转换 |
| commands/{vehicle_id} | events.commands | 下行 | ingest 转换 |

**约定**：

- MQTT topic 用斜杠：`telemetry/raw`、`commands/{id}`
- 总线 topic 用点：`telemetry.raw`、`events.commands`
- 命名一一对应，方便排查

### 变更四：补充消费者组规范

| 服务 | 消费组 | 订阅主题 |
|---|---|---|
| ingest | apiscloud-ingest | events.commands |
| data-writer | apiscloud-data-writer | telemetry.raw、telemetry.aggregated、events.alerts |

**命名规则**：`apiscloud-{service}`。

**好处**：多实例部署时，同服务共享消费组，自动负载均衡。

### 变更五：补充 partitionKey = vehicle_id

ingest 发布 `telemetry.raw` 时，显式传 `partitionKey = vehicle_id`。

好处：

- Kafka 同一车辆的消息落到同一分区，保证顺序
- 消费者按车辆维度并行处理，不会跨车乱序

### 变更六：补充集成测试

阶段二实现了集成测试 `tests/integration.mqttToPg.test.ts`，覆盖：

- 单条遥测：MQTT → 总线 → PG `vehicle_latest` + `vehicle_telemetry` + Redis 热路径
- UPSERT 参数正确
- INSERT 参数含 ISO 时间戳
- 遥测写 Redis 热路径，TTL 60s
- 遥测加到活跃车辆集合
- 非法遥测不进入总线也不写 PG
- 非 JSON payload 不崩溃
- 100 条遥测全部到达 PG
- 500 条遥测全链路跑通
- 下行命令：总线 `events.commands` → MQTT `commands/{vehicle_id}`

### 变更七：补充阶段二文档

| 文档 | 覆盖内容 |
|---|---|
| `simulator.V1.md` | 模拟器：状态机、GPS 生成器、MQTT 上报、500 辆模拟 |
| `ingest.V1.md` | MQTT 出入口：上行遥测转总线、下行命令转 MQTT、输入校验 |
| `dataWriter.V1.md` | 统一写库：消费总线写 PG 和 Redis、UPSERT、Redis 热路径 |
| `messageBus.V2.md` | 消息总线 V2：主题分区保留策略、消费组规范、partitionKey |

---

## 五、后续版本

### V2 修改（阶段二）

- 补充 simulator 实现：状态机 + GPS 生成器 + 500 辆模拟 + MQTT 上报
- 补充 ingest 实现：MQTT ↔ 总线双向转换 + 输入校验
- 补充 data-writer 实现：订阅 3 个主题写 PG 和 Redis
- 补充消息总线主题：4 个主题的分区数和保留策略
- 补充集成测试：MQTT → 总线 → PG 全链路
- 补充核心服务实现状态表
- 补充已实现的数据流和未实现的数据流

### 后续版本

- 阶段三：补充 dispatch-core、geofence、anomaly
- 阶段四：补充 gateway、webShell
- 阶段五：补充消息总线性能优化
- 阶段六：补充部署、监控、追踪、多集群