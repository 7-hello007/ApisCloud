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
| `observability.V1.md` | 可观测性：指标、日志、追踪预留 |
| `security.V1.md` | 安全基础：认证、输入验证、密钥管理 |
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

### 后续阶段（待补）

- `deployment.V1.md`
- `testing.V1.md`
- `api.V1.md`

---

## 写作原则

1. **一功能一文档**：不合并、不拆分。
2. **版本递增**：修改时更新内容，V1 → V2 → V3。
3. **记录为什么**：不只写「改了什么」，还要写「为什么改」。
4. **保持同步**：功能改完立刻更新文档，不拖延。
5. **可追溯**：每个版本记录时间、触发原因、影响范围。