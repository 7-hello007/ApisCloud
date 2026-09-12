# 一、阶段 1.9 建立 registry · 经验总结

## 1. 完成了什么

阶段 1.9 结束时，插件注册表机制完整可用：

| 模块 | 文件 | 能力 |
|---|---|---|
| 目录扫描 | `scripts/lib/scanner.js` | 遍历目录找 `plugin.json`，跳过 `_` 和 `.` 开头的目录 |
| manifest 校验 | `scripts/lib/validator.js` | 手动校验字段，补默认值，未知字段警告 |
| 拓扑排序 | `scripts/lib/topo.js` | Kahn 算法，稳定输出，检测循环依赖和缺失依赖 |
| profile 索引 | `scripts/lib/profiles.js` | profile → 插件名列表，加 `all` 伪 profile |
| 主入口 | `scripts/build-registry.js` | 导出 `buildRegistry` 函数，CLI 和单测都能用 |
| 核心服务清单 | `core/services/*/plugin.json` | 10 个核心服务的 manifest |
| 示例插件 | `plugins/example-plugin/` | 验证扫描机制的示例插件 |
| 测试 | `tests/registry.build.test.ts` | 13 个测试，覆盖扫描、校验、拓扑、profile、统计 |

配套：

- Makefile 加 `registry-check` 目标
- CI 的 `registry-check` job 真正生效
- registry 输出结构定契约：`version`、`generatedAt`、`generator`、`coreVersion`、`services`、`plugins`、`byProfile`、`topologicalOrder`、`stats`

### registry.json 的结构

| 字段 | 说明 |
|---|---|
| `version` | registry 格式版本 |
| `generatedAt` | 生成时间 |
| `generator` | 生成器标识 |
| `coreVersion` | 核心版本 |
| `services` | 核心服务清单 |
| `plugins` | 插件清单 |
| `byProfile` | profile → 插件名列表，含 `all` |
| `topologicalOrder` | 拓扑序的加载顺序 |
| `stats` | 统计信息 |

### 关键设计

- **`buildRegistry` 可单测**：导出为函数，接受 `root`、`write`、`serviceDirs`、`pluginDirs` 选项。
- **拓扑排序稳定**：Kahn 算法 + 每轮队列排序，同层按名字确定顺序。
- **`core/services` 强制 core=true**：写错会抛错。
- **全局查重**：所有服务和插件名必须唯一。
- **跳过 `_` 开头目录**：`_template` 不会被当成真实插件。

## 2. 怎么完成的

按这个顺序推进：

1. **建目录**：`scripts/lib/`。
2. **写 `scanner.js`**：遍历目录，找 `plugin.json`，跳过下划线开头目录。
3. **写 `validator.js`**：手动校验 manifest 字段，补默认值，未知字段警告。
4. **写 `topo.js`**：Kahn 算法，稳定输出，检测循环依赖和缺失依赖。
5. **写 `profiles.js`**：按 profile 建立索引，加 `all` 伪 profile。
6. **重写 `build-registry.js`**：组合四个模块，导出 `buildRegistry`，CLI 入口保留。
7. **建 10 个核心服务 manifest**：`core/services/*/plugin.json`，全部 `core: true`。
8. **建示例插件**：`plugins/example-plugin/`，验证扫描机制。
9. **写测试**：`registry.build.test.ts`，13 个测试，覆盖正常路径和错误路径。
10. **更新 Makefile**：加 `registry-check`。
11. **清缓存重编**：`find . -name "*.tsbuildinfo" ... -delete`，再 `pnpm typecheck`。

## 3. 遇到了什么问题

阶段 1.9 踩了 1 个坑：

| # | 问题 | 表现 |
|---|---|---|
| 1 | 插件名重复时报错信息错乱 | 测试期望「插件名重复」，实际报「检测到循环依赖」 |

**根因：** `buildRegistry` 里**先做拓扑排序，后做重名检查**。两个插件同名时，`topologicalSort` 的 `byName` Map 后一个覆盖前一个，入度计算错乱，抛的是「循环依赖」。

## 4. 怎么解决的

| # | 解决方案 |
|---|---|
| 1 | 把**重名检查移到拓扑排序之前**，把它作为拓扑排序的前置条件。逻辑更清晰，报错也更准确 |

**代码改动：**

```js
// 修复前
const allItems = [...services, ...plugins];
const byProfile = buildProfileIndex(allItems);
const topologicalOrder = topologicalSort(allItems);

// 重名检查（太晚）
const names = new Set();
...

// 修复后
const allItems = [...services, ...plugins];

// 重名检查必须先做
const names = new Set();
for (const item of allItems) {
  if (names.has(item.name)) {
    throw new Error(`插件名重复：${item.name}`);
  }
  names.add(item.name);
}

const byProfile = buildProfileIndex(allItems);
const topologicalOrder = topologicalSort(allItems);
```

## 5. 关键经验

1. **拓扑排序的前置条件是名称唯一**。输入有重名时，算法行为未定义，必须先做唯一性检查。
2. **检查顺序要按依赖关系排**。校验 → 查重 → profile 索引 → 拓扑排序，每一步都建立在前一步的保证上。
3. **Kahn 算法要每轮排序队列**。否则输出顺序不确定，测试不稳定。
4. **扫描器跳过 `_` 和 `.` 开头的目录**。`_template` 是模板，不是真实插件。
5. **`core/services` 下强制 `core: true`**。写错直接报错，防止核心服务被当成插件。
6. **`buildRegistry` 导出为函数**。CLI 和单测共用一套逻辑，测试传 `write: false` 不污染真实文件。
7. **registry 输出结构是核心契约**。`version`、`services`、`plugins`、`byProfile`、`topologicalOrder`、`stats`，一旦定下，破坏性改动要版本化。
8. **`path.relative` 输出跨平台**。Windows 的 `\` 要转成 `/`，`.split(path.sep).join('/')`。
9. **未知字段只警告不报错**。向后兼容，未来加字段不会破坏旧插件。
10. **registry.json 是生成产物**。不进 Git，`.gitignore` 已排除。
11. **CI 的 `registry-check` job 真正生效**。生成 registry 后校验 JSON 合法性。
12. **profile 索引加 `all` 伪 profile**。方便"启用全部插件"的场景。
13. **重名检查用 Set 而不是数组**。O(1) 查重，代码清晰。

## 6. 阶段 1.9 验收清单

- [x] `scripts/lib/scanner.js` 扫描目录
- [x] `scripts/lib/validator.js` 校验 manifest
- [x] `scripts/lib/topo.js` 拓扑排序
- [x] `scripts/lib/profiles.js` profile 索引
- [x] `scripts/build-registry.js` 主入口，导出 `buildRegistry`
- [x] 10 个核心服务 `plugin.json` 就位
- [x] `example-plugin` 示例插件就位
- [x] `make build-registry` 生成完整 registry.json
- [x] `registry.json` 含 `services`、`plugins`、`byProfile`、`topologicalOrder`、`stats`
- [x] `pnpm typecheck` 通过
- [x] `pnpm test:unit` 16 个 suite 全绿
- [x] 拓扑排序：依赖在前，循环依赖抛错
- [x] profile 索引：`core`、`full`、`all` 三个 key

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
| 1.2 | 编写数据库初始化 | ✅ 已完成 | `deploy/postgres/init.sql` 建 4 张表 + 1 视图 |
| 1.3 | 编写共享库 | ✅ 已完成 | `core/libs` 8 个模块，19 个单元测试全绿 |
| 1.4 | 编写消息总线抽象层 | ✅ 已完成 | `shared/message-bus` 3 个适配器 + 8 个测试 suite 全绿 |
| 1.5 | 编写层配置 | ✅ 已完成 | `shared/layer-config` 单层配置 + 5 个查询函数 + 13 个新测试 |
| 1.6 | 编写插件宿主 | ✅ 已完成 | `core/plugin-host` 8 个模块 + 模板插件 + 14 个 suite 全绿 |
| 1.7 | 编写可观测性服务 | ✅ 已完成 | `core/services/observability` 9 个指标 + 2 个端点 + 15 个 suite 全绿 |
| 1.8 | 编写 CI 配置 | ✅ 已完成 | `ci.yml` + `security.yml` + `dependabot.yml` + PR/Issue 模板 + gitleaks 白名单 |
| 1.9 | 建立 registry | ✅ 已完成 | `scripts/lib/` 4 个模块 + `buildRegistry` + 10 个服务 manifest + 13 个新测试 |
| 1.10 | 建立 docs | ⬜ 未开始 | 目录已建，文档未写 |
| 1.11 | 建立 tests | ✅ 已完成 | `jest.config.js`、`setup.js`、`README.md`、冒烟测试已建 |
| 1.12 | 编写安全基础 | 🟡 部分完成 | security 模块在 libs 里已做，独立文档未写 |
| 1.13 | 编写文档 | ⬜ 未开始 | 未做 |

---

## 下一步

原始任务 **1.10 是：建立 docs**。

具体做：

- `docs/README.md`：文档目录和使用规范。
- `docs/architecture.V1.md`：系统架构总览。
- `docs/infra.V1.md`：基础设施编排。
- `docs/messageBus.V1.md`：消息总线抽象层。
- `docs/layerConfig.V1.md`：层配置。
- `docs/pluginHost.V1.md`：插件宿主。
- `docs/observability.V1.md`：可观测性服务。
- `docs/security.V1.md`：安全基础。
- `docs/cicd.V1.md`：CI/CD 配置。

每篇文档按模板：功能目标 / 基础实现 / V1 修改 / 后续版本。

需要我继续讲 **阶段 1.10：建立 docs** 吗？