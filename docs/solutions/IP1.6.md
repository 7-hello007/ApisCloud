# 一、阶段 1.6 插件宿主 · 经验总结

## 1. 完成了什么

阶段 1.6 结束时，`core/plugin-host` 具备以下能力：

| 模块 | 文件 | 能力 |
|---|---|---|
| types | `src/types.ts` | `Plugin`、`PluginContext`、`PluginManifest`、`LoadedPlugin`、`Route`、`PluginHealth` |
| schema | `src/schema.ts` | zod 校验 `plugin.json`，插件名正则，默认值补全 |
| guard | `src/guard.ts` | `withTimeout` 超时控制、`safeCall` 异常保护 |
| loader | `src/loader.ts` | `readManifest`、`resolveEntry`、`loadPluginInstance`、`loadPlugin` |
| registry | `src/registry.ts` | 内存注册表，按名唯一，支持按 profile / core 过滤 |
| lifecycle | `src/lifecycle.ts` | 管理 `onLoad` / `onUnload`，带超时和异常保护 |
| host | `src/host.ts` | `PluginHost` 类，编排加载、卸载、消息分发、定时、路由、健康检查 |
| index | `src/index.ts` | 统一出口 |

配套：

- 依赖装好：zod、@apiscloud/libs、@apiscloud/message-bus
- 模板插件：`plugins/_template/plugin.json` + `plugins/_template/src/index.js`
- 4 个新测试文件：loadPlugin、registry、guard、host
- 测试 suite 从 10 个增加到 14 个

### PluginHost 的公开方法

| 方法 | 作用 |
|---|---|
| `register(loaded)` | 注册已加载的插件 |
| `loadAll(profile?)` | 加载所有（或按 profile 过滤）插件，调用 `onLoad` |
| `unloadAll()` | 逆序卸载所有插件，调用 `onUnload` |
| `dispatchMessage(topic, envelope)` | 分发给订阅了该主题的插件 |
| `dispatchTimer()` | 定时调用所有插件的 `onTimer` |
| `getRoutes()` | 聚合所有插件暴露的路由 |
| `health()` | 聚合所有插件的健康状态 |
| `getRegistry()` | 暴露注册表供检查 |

### 核心设计

- **进程内扩展**：插件不创建进程，由 plugin-host 统一加载。
- **异常隔离**：插件任何回调抛错都不影响宿主，被 `try/catch` 包裹。
- **超时兜底**：`onLoad` 5s、`onUnload` 5s、`onMessage` 1s、`onTimer` 1s。
- **按 profile 过滤**：`loadAll('core')` 只加载 profile 含 `core` 的插件。
- **按 topics 订阅过滤**：`dispatchMessage` 只发给 `topics.subscribe` 里声明的插件。
- **插件名唯一**：注册表查重，重复注册抛错。
- **模板即用**：`plugins/_template/` 复制即用，改 `plugin.json` 的 name 和业务代码即可。

## 2. 怎么完成的

按这个顺序推进：

1. **装依赖**：`pnpm add zod`、`pnpm add @apiscloud/libs@workspace:*`、`pnpm add @apiscloud/message-bus@workspace:*`。
2. **建目录**：`core/plugin-host/src`、`plugins/_template/src`。
3. **写 `types.ts`**：定义 6 个接口/类型。
4. **写 `schema.ts`**：`PluginManifestSchema`，插件名正则，`core`/`lazy`/`profile` 给默认值。
5. **写 `guard.ts`**：`withTimeout` 用 `Promise.race` + 定时器清理；`safeCall` 返回 `{ ok, value|error }`。
6. **写 `loader.ts`**：`readManifest` 读 + 校验；`resolveEntry` 按优先级找入口；`loadPluginInstance` 处理 ESM/CJS 兼容；`loadPlugin` 组合。
7. **写 `registry.ts`**：`PluginRegistry` 类，Map 存储，4 个查询方法。
8. **写 `lifecycle.ts`**：`LifecycleManager` 类，`load` / `unload` 各自包超时和异常保护。
9. **写 `host.ts`**：`PluginHost` 类，8 个公开方法，每个分发路径都有超时和 try/catch。
10. **写 `index.ts`**：统一出口。
11. **写 `plugins/_template/`**：`plugin.json` + `src/index.js`，含 6 个可选钩子的空实现。
12. **写测试**：4 个测试文件，共 23 个测试。
13. **清缓存重编**：`find . -name "*.tsbuildinfo" ... -delete`，再 `pnpm typecheck`。

## 3. 遇到了什么问题

阶段 1.6 一共踩了 2 个坑：

| # | 问题 | 表现 |
|---|---|---|
| 1 | tsbuildinfo 文件路径冲突 | VS Code 报「无法写入 `tsconfig.tsbuildinfo`，它将覆盖由引用的项目生成的 `.tsbuildinfo` 文件」 |
| 2 | 项目引用形成循环图 | `tsc -b` 报 TS6202：`Project references may not form a circular graph. Cycle detected: tsconfig.json / shared/message-bus/tsconfig.json` |

## 4. 怎么解决的

| # | 解决方案 |
|---|---|
| 1 | 在 `tsconfig.base.json` 里加 `"tsBuildInfoFile": "dist/.tsbuildinfo"`，让每个子包的 tsbuildinfo 落在自己的 `dist/` 下，避开默认路径冲突 |
| 2 | 逐个检查子包的 `references` 方向：`core/libs` 无 references；`shared/message-bus` 只引用 `core/libs`；`core/plugin-host` 引用 `core/libs` + `shared/message-bus`；根 `tsconfig.json` 引用全部子包。删掉误加的循环引用 |

**依赖方向必须是 DAG（有向无环图）：**

```
core/libs（最底层，无 references）
    ↑
shared/types、shared/contracts、shared/layer-config
    ↑
shared/message-bus（references: [core/libs]）
    ↑
core/plugin-host（references: [core/libs, shared/message-bus]）
    ↑
根 tsconfig.json（references: 上述全部）
```

## 5. 关键经验

1. **monorepo 的 `references` 必须严格单向**。任何反向引用都会形成环，`tsc -b` 直接报 TS6202。
2. **`tsBuildInfoFile` 显式指定**，让每个子包的 tsbuildinfo 落在自己的 `dist/` 下，避免 VS Code 和 CLI 抢同一个文件。
3. **`withTimeout` 要 `finally clearTimeout`**，否则超时定时器会泄漏。
4. **`Promise.race` 里的原始 Promise 要 `.catch(() => undefined)`**，避免超时后原始 Promise 的拒绝变成未处理拒绝。
5. **插件的异常隔离要在每个回调上做**，不能只在 `loadAll` 外层包一层。`onLoad`、`onUnload`、`onMessage`、`onTimer`、`getRoutes`、`getHealth` 都要单独保护。
6. **`dispatchMessage` 要先过滤 topics**，只发给 `manifest.topics.subscribe` 里声明的插件，避免无谓调用。
7. **`PluginRegistry.register` 要查重**，插件名唯一是核心契约。
8. **`resolveEntry` 按优先级找入口**：`dist/index.js` > `src/index.js` > `index.js`。开发期用 src，构建期用 dist。
9. **`getRoutes` 和 `getHealth` 抛错不能崩宿主**，要 try/catch 后记为 `down`。
10. **`unloadAll` 逆序卸载**，后加载的先卸载，符合栈式生命周期。
11. **模板插件目录命名用 `_template`**，扫描时跳过下划线开头的目录，模板不会被当成真实插件加载。
12. **`plugin.json` 的 `name` 要和目录名解耦**，目录可以叫 `_template`，name 必须是 `template`（合法插件名）。

## 6. 阶段 1.6 验收清单

- [x] `core/plugin-host` 依赖装好：zod、@apiscloud/libs、@apiscloud/message-bus
- [x] `types.ts` 定义 6 个接口/类型
- [x] `schema.ts` zod 校验 plugin.json
- [x] `guard.ts` 超时控制、异常保护
- [x] `loader.ts` 读 manifest + 动态加载入口
- [x] `registry.ts` 内存注册表，支持按名、profile、core 过滤
- [x] `lifecycle.ts` 管理 onLoad / onUnload
- [x] `host.ts` `PluginHost` 类，8 个公开方法
- [x] `index.ts` 统一出口
- [x] `plugins/_template/plugin.json` + `src/index.js` 就位
- [x] `pnpm typecheck` 通过
- [x] `pnpm test:unit` 14 个 suite 全绿
- [x] `pnpm build` 生成 dist 产物

---

# 二、阶段一 · 全部任务回顾

以下是原始计划书里的阶段一任务表，原样保留：

## 阶段一：基础设施与共享库

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

## 任务进度对照

原始 13 项任务与当前实际进度的对应关系：

| 序号 | 任务 | 状态 | 说明 |
|---|---|---|---|
| 前置 | 工程初始化 | ✅ 已完成 | 我实际展开时新增的步骤，对应原任务的 1.9/1.10/1.11 的目录与骨架 |
| 1.1 | 编写基础设施编排 | ✅ 已完成 | `docker-compose.infra.yml` 一键启动 7 个服务，全部 healthy |
| 1.2 | 编写数据库初始化 | ✅ 已完成 | `deploy/postgres/init.sql` 建 4 张表 + 1 视图，PG 首次启动自动执行 |
| 1.3 | 编写共享库 | ✅ 已完成 | `core/libs` 8 个模块，19 个单元测试全绿 |
| 1.4 | 编写消息总线抽象层 | ✅ 已完成 | `shared/message-bus` 3 个适配器 + 8 个测试 suite 全绿 |
| 1.5 | 编写层配置 | ✅ 已完成 | `shared/layer-config` 单层配置 + 5 个查询函数 + 13 个新测试 |
| 1.6 | 编写插件宿主 | ✅ 已完成 | `core/plugin-host` 8 个模块 + 模板插件 + 14 个 suite 全绿 |
| 1.7 | 编写可观测性服务 | 🟡 部分完成 | 基础设施侧 Prometheus/Loki/Grafana 已就位，应用侧 observability 服务未做 |
| 1.8 | 编写 CI 配置 | ⬜ 未开始 | `.github/workflows/` 目录已建 |
| 1.9 | 建立 registry | 🟡 部分完成 | 目录、`.gitkeep`、`build-registry.js` 已建，扫描逻辑有骨架 |
| 1.10 | 建立 docs | ⬜ 未开始 | 目录已建，文档未写 |
| 1.11 | 建立 tests | ✅ 已完成 | `jest.config.js`、`setup.js`、`README.md`、冒烟测试已建 |
| 1.12 | 编写安全基础 | 🟡 部分完成 | security 模块在 libs 里已做，独立文档未写 |
| 1.13 | 编写文档 | ⬜ 未开始 | 未做 |

---

## 下一步

原始任务 **1.7 是：编写可观测性服务**。

具体做：

- `core/services/observability/package.json`、`tsconfig.json`。
- `core/services/observability/src/index.ts`：可观测性服务入口。
- 暴露 `/metrics` 端点，用 `@apiscloud/libs` 的 `createMetrics`。
- 暴露 `/health` 端点，用 `@apiscloud/libs` 的 `createHealthRegistry`。
- 集成 Loki：日志格式带 `trace_id`、`span_id`，可被 Promtail 采集。
- 预留追踪：日志格式已含 `trace_id`、`span_id`，未来接 OpenTelemetry + Jaeger 零改动。
- 注册到 `plugin-host` 或独立进程。
- 测试：`observability.collect.test.ts`。

需要我继续讲 **阶段 1.7：编写可观测性服务**吗？