# ApisCloud 文档

一个功能一个文档，按「功能名.V几.md」命名，版本递增。

---

## 命名规范

```
功能名.V几.md
```

示例：

- `dispatchCore.V1.md` — 调度核心，第 1 版
- `dispatchCore.V2.md` — 调度核心，第 2 版（修改后版本递增）
- `pluginHost.V1.md` — 插件宿主，第 1 版

**一个功能只有一个文档**，修改时版本号递增，文档内容更新，**不新建多个文件**。

---

## 写作模板

每个文档按以下结构写：

```markdown
# 功能名 V几

## 一、功能目标

这个功能要解决什么问题，达成什么效果。

## 二、基础实现

第一版实现了什么，关键设计是什么，文件在哪里。

## 三、V1 修改

第一次修改了什么、为什么改、怎么改。

## 四、V2 修改

第二次修改了什么、为什么改、怎么改。

## 五、后续版本

按版本递增，记录每次修改。
```

---

## 文档清单

### 阶段一（基础设施与共享库）

| 文档 | 覆盖内容 |
|---|---|
| `architecture.V2.md` | 系统架构总览：分层、服务、数据流（替代 V1） |
| `infra.V1.md` | 基础设施编排：PG/Redis/EMQX/Kafka/Prometheus/Grafana/Loki |
| `messageBus.V3.md` | 消息总线抽象层：接口、信封、适配器、切换、主题分层、filter、共享消费者组、懒订阅（替代 V2） |
| `layerConfig.V3.md` | 层配置：服务与层分离、layers.yml、加层、多层验证（替代 V2） |
| `pluginHost.V2.md` | 插件宿主：加载、注册、生命周期、异常保护、bus 注入（替代 V1） |
| `observability.V2.md` | 可观测性：指标、日志、追踪预留、业务指标、Grafana 仪表板、Loki 结构化标签（替代 V1） |
| `security.V2.md` | 安全基础：认证、输入验证、密钥管理、gateway 认证限流、指令签名校验（替代 V1） |
| `cicd.V1.md` | CI/CD：GitHub Actions、安全扫描、Dependabot |

### 阶段二（核心数据流服务）

| 文档 | 覆盖内容 |
|---|---|
| `simulator.V1.md` | 模拟器：状态机、GPS 生成器、MQTT 上报、500 辆模拟 |
| `ingest.V1.md` | MQTT 出入口：上行遥测转总线、下行命令转 MQTT、输入校验 |
| `dataWriter.V1.md` | 统一写库：消费总线写 PG 和 Redis、UPSERT、Redis 热路径、查询端点 |

### 阶段三（核心业务与调度算法）

| 文档 | 覆盖内容 |
|---|---|
| `dispatchCore.V1.md` | 调度核心：任务分发、约束、目标函数、算法调度、签名 |
| `nearestDispatch.V1.md` | 最近邻调度算法：Haversine 距离排序 |
| `batchMatch.V1.md` | 批量匹配算法：多因素成本最小化 |
| `priorityDispatch.V1.md` | 优先级调度算法：优先级动态调整权重 |
| `geofence.V1.md` | 地理围栏检测插件：圆形区域进出告警 |
| `anomaly.V1.md` | 异常检测插件：速度超阈值 + 电量骤降 |

### 阶段四（插件系统与前端外壳）

| 文档 | 覆盖内容 |
|---|---|
| `gateway.V1.md` | HTTP 统一入口：路由注入、反向代理、插件路由聚合、PluginHost 集成 |
| `webShell.V1.md` | 前端外壳：布局、主题、插件前端加载器、UI 组件 |
| `dashboard.V1.md` | 仪表板插件：总览、车辆、告警、指令 |

### 阶段五（插件生态与性能优化）

| 文档 | 覆盖内容 |
|---|---|
| `aggregator.V1.md` | 聚合器：消费 telemetry.raw，按时间窗聚合成 telemetry.aggregated |
| `chargingScheduler.V1.md` | 充电调度插件：消费聚合遥测，检测低电量，下发充电指令 |
| `routeOptimizer.V1.md` | 路线优化插件：消费遥测，检测低速车，发优化指令，filter 机制 |
| `reporting.V1.md` | 报表插件：从 data-writer 查询端点拉数据，生成报表 |
| `busPerformance.V1.md` | 消息总线性能策略：主题分层、选择性订阅、共享消费者组、Redis 热路径、批量消费、按车辆分区、插件懒订阅、总线可切换 |

### 阶段六（测试完善、部署与交付）

| 文档 | 覆盖内容 |
|---|---|
| `deployment.V1.md` | 部署指南：本地开发、Docker Compose、云端 K8s（预留）、环境变量清单、部署踩坑 |
| `testing.V1.md` | 测试规范：三层测试、命名规范、覆盖率、测试辅助、写测试原则、修复流程、真实基础设施验证 |
| `api.V1.md` | API 文档：Gateway 管理端点、反向代理、data-writer 查询端点、reporting 插件路由、认证限流、MQTT 主题、消息总线主题、消息信封、错误响应 |
| `delivery.V1.md` | 交付文档：项目总览、交付清单、端到端验证结果、使用方式、架构总结、技术栈、已知限制、后续路线、交付验收 |

### 后续阶段（待补）

- `architecture.V3.md`（多集群、多层扩展时更新）
- `layerConfig.V4.md`（cluster、bus、replicas 字段）
- `messageBus.V4.md`（批量消费实现、Pulsar/NATS/Redis 适配器）
- `security.V3.md`（mTLS、插件签名、威胁建模、隐私保护）
- `observability.V3.md`（OpenTelemetry + Jaeger 接入）

---

## 文档导航

| 想了解… | 看哪个文档 |
|---|---|
| 项目交付总结 | `delivery.V1.md` |
| 系统整体架构 | `architecture.V2.md` |
| 数据流 | `architecture.V2.md` 的"数据流"章节 |
| 怎么部署 | `deployment.V1.md` |
| 怎么测试 | `testing.V1.md` |
| 有哪些 API | `api.V1.md` |
| 怎么加插件 | `pluginHost.V2.md` |
| 怎么改层 | `layerConfig.V3.md` |
| 怎么切总线 | `messageBus.V3.md` |
| 有哪些指标 | `observability.V2.md` |
| 安全怎么做的 | `security.V2.md` |
| 调度算法怎么调 | `dispatchCore.V1.md` |
| 性能怎么优化 | `busPerformance.V1.md` |
| 充电调度怎么工作 | `chargingScheduler.V1.md` |
| 路线优化怎么工作 | `routeOptimizer.V1.md` |
| 报表怎么工作 | `reporting.V1.md` |
| 聚合器怎么工作 | `aggregator.V1.md` |
| 前端怎么加载插件 | `webShell.V1.md` |
| 仪表板有哪些页面 | `dashboard.V1.md` |

---

## 文档版本一览

| 文档 | 最新版本 | 更新历史 |
|---|---|---|
| `architecture` | V2 | V1（单层）→ V2（加 simulator/ingest/data-writer） |
| `messageBus` | V3 | V1（首版）→ V2（主题分区保留）→ V3（分层/filter/共享组/懒订阅） |
| `layerConfig` | V3 | V1（首版）→ V2（gateway 加入）→ V3（多层验证） |
| `pluginHost` | V2 | V1（首版）→ V2（bus 注入 + metrics 注入） |
| `observability` | V2 | V1（首版）→ V2（业务指标 + Grafana + Loki） |
| `security` | V2 | V1（首版）→ V2（认证 + 限流 + 签名校验） |
| `infra` | V1 | 首版 |
| `cicd` | V1 | 首版 |
| `simulator` | V1 | 首版 |
| `ingest` | V1 | 首版 |
| `dataWriter` | V1 | 首版 |
| `dispatchCore` | V1 | 首版 |
| `nearestDispatch` | V1 | 首版 |
| `batchMatch` | V1 | 首版 |
| `priorityDispatch` | V1 | 首版 |
| `geofence` | V1 | 首版 |
| `anomaly` | V1 | 首版 |
| `gateway` | V1 | 首版 |
| `webShell` | V1 | 首版 |
| `dashboard` | V1 | 首版 |
| `aggregator` | V1 | 首版 |
| `chargingScheduler` | V1 | 首版 |
| `routeOptimizer` | V1 | 首版 |
| `reporting` | V1 | 首版 |
| `busPerformance` | V1 | 首版 |
| `deployment` | V1 | 首版 |
| `testing` | V1 | 首版 |
| `api` | V1 | 首版 |
| `delivery` | V1 | 首版 |

---

## 阶段与里程碑

| 阶段 | 里程碑 | 状态 | 对应文档 |
|---|---|---|---|
| 阶段一 | M1 基础设施 + 共享库 | ✅ | `architecture`、`infra`、`messageBus`、`layerConfig`、`pluginHost`、`observability`、`security`、`cicd` |
| 阶段二 | M2 数据流主干 | ✅ | `simulator`、`ingest`、`dataWriter` |
| 阶段三 | M3 业务 + 调度算法 | ✅ | `dispatchCore`、`nearestDispatch`、`batchMatch`、`priorityDispatch`、`geofence`、`anomaly` |
| 阶段四 | M4 插件系统 + 前端 | ✅ | `gateway`、`webShell`、`dashboard` |
| 阶段五 | M5 插件生态 + 性能 | ✅ | `aggregator`、`chargingScheduler`、`routeOptimizer`、`reporting`、`busPerformance` |
| 阶段六 | M6 测试 + 部署 + 交付 | ✅ | `deployment`、`testing`、`api`、`delivery` |

**6 个里程碑全部达成。**

---

## 写作原则

1. **一功能一文档**：不合并、不拆分。
2. **版本递增**：修改时更新内容，V1 → V2 → V3。
3. **记录为什么**：不只写「改了什么」，还要写「为什么改」。
4. **保持同步**：功能改完立刻更新文档，不拖延。
5. **可追溯**：每个版本记录时间、触发原因、影响范围。