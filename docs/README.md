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
| `architecture.V1.md` | 系统架构总览：分层、服务、数据流 |
| `infra.V1.md` | 基础设施编排：PG/Redis/EMQX/Kafka/Prometheus/Grafana/Loki |
| `messageBus.V1.md` | 消息总线抽象层：接口、信封、适配器、切换 |
| `layerConfig.V1.md` | 层配置：服务与层分离、layers.yml、加层 |
| `pluginHost.V1.md` | 插件宿主：加载、注册、生命周期、异常保护 |
| `observability.V1.md` | 可观测性：指标、日志、追踪预留 |
| `security.V1.md` | 安全基础：认证、输入验证、密钥管理 |
| `cicd.V1.md` | CI/CD：GitHub Actions、安全扫描、Dependabot |

### 后续阶段（待补）

- `simulator.V1.md`
- `ingest.V1.md`
- `dataWriter.V1.md`
- `dispatchCore.V1.md`
- `gateway.V1.md`
- `webShell.V1.md`
- `dashboard.V1.md`
- `deployment.V1.md`

---

## 写作原则

1. **一功能一文档**：不合并、不拆分。
2. **版本递增**：修改时更新内容，V1 → V2 → V3。
3. **记录为什么**：不只写「改了什么」，还要写「为什么改」。
4. **保持同步**：功能改完立刻更新文档，不拖延。
5. **可追溯**：每个版本记录时间、触发原因、影响范围。