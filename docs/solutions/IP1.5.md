# 一、阶段 1.5 层配置 · 经验总结

## 1. 完成了什么

阶段 1.5 结束时，`shared/layer-config` 具备以下能力：

| 模块 | 文件 | 能力 |
|---|---|---|
| layers.yml | `layers.yml` | 声明单层结构，含 10 个核心服务，注释预留三层/四层 |
| schema | `schema.ts` | zod 校验层配置，`KNOWN_SERVICES` 白名单，层名正则，非空校验 |
| loader | `loader.ts` | 读文件、YAML 解析、zod 校验、层名唯一性校验，5 个查询函数 |
| index | `index.ts` | 统一出口 |

配套：

- 依赖装好：yaml、zod、@apiscloud/libs
- `package.json` build 脚本复制 `layers.yml` 到 dist
- 2 个新测试文件：load、addLayer，共 13 个新测试
- 测试 suite 从 8 个增加到 10 个

### 五个查询函数

| 函数 | 作用 |
|---|---|
| `loadLayers` | 读文件、解析、校验，返回 `LayersConfig` |
| `getLayer` | 按名取层，不存在抛错 |
| `getServices` | 取某层服务清单，返回副本 |
| `getLayerNames` | 取所有层名 |
| `isServiceEnabled` | 判断某服务是否在某层启用 |

### 核心设计

- **服务白名单**：`KNOWN_SERVICES` 是常量数组，写成错误的服务名会在校验时被拦下。
- **层名正则**：`^[a-z][a-z0-9-]*$`，只能小写字母、数字、连字符，且以字母开头。
- **层名唯一性**：zod 不支持数组元素唯一性，在 loader 里手动校验。
- **配置驱动**：加层只改 `layers.yml`，服务代码零改动。

## 2. 怎么完成的

按这个顺序推进：

1. **装依赖**：`pnpm add yaml zod`，`pnpm add @apiscloud/libs@workspace:*`。
2. **写 `layers.yml`**：声明单层 `single`，10 个服务，注释预留三层/四层。
3. **写 `schema.ts`**：`KNOWN_SERVICES` 白名单 + `LayerSchema` + `LayersConfigSchema`。
4. **写 `loader.ts`**：`loadLayers` 做读取、解析、校验、唯一性检查；5 个查询函数。
5. **写 `index.ts`**：统一出口。
6. **改 `package.json`**：build 脚本加 copy `layers.yml` 到 dist 的步骤。
7. **写测试**：`layerConfig.load.test.ts`（7 个测试）、`layerConfig.addLayer.test.ts`（7 个测试）。
8. **确认 jest 映射**：`@apiscloud/layer-config` 已在 `moduleNameMapper` 里。
9. **清缓存重编**：`find . -name "*.tsbuildinfo" ... -delete`，再 `pnpm typecheck`。
10. **构建验证**：`pnpm build`，确认 dist 含 `layers.yml`。

## 3. 关键经验

1. **zod 不支持数组元素唯一性**，层名重复要在 loader 里手动检查。
2. **服务名用 `z.enum` 而非 `z.string`**，白名单约束让错写服务名在校验期暴露，而不是运行时才炸。
3. **层名用正则约束**，防止大写、下划线、中文等不合规命名。
4. **`getServices` 返回副本**，`[...layer.services]` 避免外部代码修改内部状态。
5. **`layers.yml` 要复制到 dist**。TypeScript 只编译 `.ts`，`.yml` 不在编译产物里，必须在 build 脚本里手动 copy。
6. **`__dirname` 在 CommonJS 可用**，loader 用 `path.join(__dirname, '..', 'layers.yml')` 找配置。
7. **配置版本号 `version: "1"`**，未来破坏性改动时递增，符合核心契约版本化原则。
8. **注释预留多层**。三层、四层配置写在注释里，需要时解开注释即可，不用从零写。
9. **测试用临时目录**。`addLayer.test.ts` 用 `fs.mkdtempSync` 生成临时目录，写测试 YAML，跑完删除，不污染项目文件。
10. **加层测试验证零改动**。从单层加到两层、三层，只改 YAML 内容，loader 和 schema 代码不动。

## 4. 阶段 1.5 验收清单

- [x] `shared/layer-config` 依赖装好：yaml、zod、@apiscloud/libs
- [x] `layers.yml` 声明单层结构，注释预留多层
- [x] `schema.ts` 定义 zod 校验，含 `KNOWN_SERVICES` 白名单
- [x] `loader.ts` 提供 5 个查询函数
- [x] `index.ts` 统一出口
- [x] `package.json` build 脚本把 `layers.yml` 复制到 dist
- [x] `pnpm typecheck` 通过
- [x] `pnpm test:unit` 10 个 suite 全绿
- [x] `pnpm build` 生成 dist 且含 `layers.yml`
- [x] 加层测试通过：单层 → 三层只需改配置

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
| 1.6 | 编写插件宿主 | ⬜ 未开始 | 只有 `index.ts` 占位 |
| 1.7 | 编写可观测性服务 | 🟡 部分完成 | 基础设施侧 Prometheus/Loki/Grafana 已就位，应用侧 observability 服务未做 |
| 1.8 | 编写 CI 配置 | ⬜ 未开始 | `.github/workflows/` 目录已建 |
| 1.9 | 建立 registry | 🟡 部分完成 | 目录、`.gitkeep`、`build-registry.js` 已建，扫描逻辑有骨架 |
| 1.10 | 建立 docs | ⬜ 未开始 | 目录已建，文档未写 |
| 1.11 | 建立 tests | ✅ 已完成 | `jest.config.js`、`setup.js`、`README.md`、冒烟测试已建 |
| 1.12 | 编写安全基础 | 🟡 部分完成 | security 模块在 libs 里已做，独立文档未写 |
| 1.13 | 编写文档 | ⬜ 未开始 | 未做 |

---

## 下一步

原始任务 **1.6 是：编写插件宿主**。

具体做：

- `core/plugin-host/src/loader.ts`：加载插件目录，读 `plugin.json`，动态 import 插件模块。
- `core/plugin-host/src/registry.ts`：插件注册表，按名字查找、按 profile 过滤。
- `core/plugin-host/src/lifecycle.ts`：管理插件生命周期，onLoad / onUnload。
- `core/plugin-host/src/guard.ts`：异常保护、超时控制。
- `core/plugin-host/src/types.ts`：定义 `Plugin` 接口、`PluginContext`。
- `core/plugin-host/src/index.ts`：统一出口，`PluginHost` 类。
- `plugins/_template/plugin.json`：模板插件清单。
- `plugins/_template/src/index.js`：模板插件实现。
- 测试：`pluginHost.loadPlugin.test.ts`、`pluginHost.guard.test.ts`。

需要我继续讲 **阶段 1.6：编写插件宿主**吗？