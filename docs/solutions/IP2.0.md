# 一、阶段 2.0 经验总结

## 1. 完成了什么

阶段 2.0 是**纯配置改动**，不动业务代码，目的是让三个新服务包（`simulator`、`ingest`、`data-writer`）能被 TypeScript、Jest、pnpm、Prometheus 正确识别。

| 步骤 | 文件 | 改动 | 状态 |
|---|---|---|---|
| 2.0.1 | `tsconfig.base.json` | 加 3 组 paths：`@apiscloud/simulator`、`@apiscloud/ingest`、`@apiscloud/data-writer` | ✅ |
| 2.0.2 | `tsconfig.json` | 加 3 个 references，指向三个新服务目录 | ✅ |
| 2.0.3 | `jest.config.js` | 加 6 条 `moduleNameMapper` | ✅ |
| 2.0.4 | `jest.config.js` | 加 3 条 `collectCoverageFrom` | ✅ |
| 2.0.5 | `.env` | 加 `SIMULATOR_PORT=9107` | ✅ |
| 2.0.6 | `.env.example` | 同步 MQTT 端口 11883、Grafana 端口 13000、加 `SIMULATOR_PORT` | ✅ |
| 2.0.7 | `monitor/prometheus/prometheus.yml` | 加 simulator target `host.docker.internal:9107` | ✅ |
| 2.0.8 | `pnpm-workspace.yaml` | 不改，`core/services/*` 已覆盖 | ✅ |
| 2.0.9 | lint 修复 | 删 `.d.ts`、改 require 注释、修 import 顺序 | ✅ |
| 2.0.10 | 验证 | `pnpm lint` 全绿，`pnpm test:unit` 142 测试全绿 | ✅ |

## 2. 怎么完成的

**第一步：路径别名先行。**
先改 `tsconfig.base.json` 的 `paths`，让 TS 能解析 `@apiscloud/simulator` 等别名。这是所有后续步骤的基础。

**第二步：构建引用同步。**
改根 `tsconfig.json` 的 `references`，让 `tsc -b` 知道要构建这三个新包。此时因为目录还没建，`pnpm typecheck` 会报 `Cannot find a tsconfig.json`，这是预期。

**第三步：Jest 映射同步。**
改 `jest.config.js` 的 `moduleNameMapper`，让测试能 import 新包；改 `collectCoverageFrom`，让覆盖率统计新代码。

**第四步：环境变量补齐。**
`.env` 加 `SIMULATOR_PORT=9107`，`.env.example` 同步，并顺手修正了阶段一遗留的 MQTT 端口不一致（`1883` → `11883`）和 Grafana 端口不一致（`3000` → `13000`）。

**第五步：监控配置补齐。**
`prometheus.yml` 加 simulator target，让指标能进 Prometheus。

**第六步：验证。**
`pnpm install` → `pnpm lint` → `pnpm test:unit` → `pnpm build`，逐步确认改动没有破坏阶段一成果。

## 3. 遇到了什么问题

### 问题一：`pnpm lint` 报 12 个 `.d.ts` 解析错误

**现象：**
```
core/libs/src/config/index.d.ts
  0:0  error  Parsing error: "parserOptions.project" has been provided for @typescript-eslint/parser.
The file was not found in any of the provided project(s): core/libs/src/config/index.d.ts
```

**原因：**
`core/libs/src/` 下误生成了 `.d.ts` 文件。正常编译产物应该在 `core/libs/dist/`，`src/` 下不该有 `.d.ts`。ESLint 用 `parserOptions.project` 指向 `tsconfig.json`，而 `tsconfig.json` 的 `include` 只覆盖 `.ts`，不覆盖这些游离的 `.d.ts`，所以 ESLint 解析失败。

**解决：**
```bash
find core/libs/src -name '*.d.ts' -type f -delete
```
只删 `src/` 下的 `.d.ts`，不动 `dist/` 和 `node_modules/`。

**教训：**
不要直接在包目录里跑 `tsc`（不带 `-b`），否则会在 `src/` 旁边生成 `.d.ts`。永远用 `pnpm build` 或 `tsc -b`。

### 问题二：`require()` 禁用注释过期

**现象：**
```
core/plugin-host/src/loader.ts
  63:15  error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports

tests/registry.build.test.ts
  6:27  error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports
```

**原因：**
`@typescript-eslint` 8.x 把规则从 `no-var-requires` 改名为 `no-require-imports`。代码里的 `// eslint-disable-next-line @typescript-eslint/no-var-requires` 注释不再生效，所以报错。

**解决：**
把注释改成新规则名：
```ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(entryPath);
```

**教训：**
升级 ESLint 插件时，要检查所有 `eslint-disable` 注释里的规则名是否还有效。

### 问题三：`import/order` 警告

**现象：**
```
core/libs/src/security/index.ts
  85:1  warning  `zod` import should occur before type import of `../config`  import/order
```

**原因：**
`import { z } from 'zod';` 写在文件中部（向后兼容段），不在顶部。ESLint 的 `import/order` 要求外部依赖在最前。

**解决：**
把 `import { z } from 'zod';` 移到文件顶部，和本地 import 之间空一行：
```ts
import { z } from 'zod';

import type { AppConfig } from '../config';

import { createJwt } from './jwt';
import { createValidation } from './validation';
```
文件中部只保留 `export { z };`。

**教训：**
`pnpm lint:fix` 能自动修大部分 import 顺序问题，但"外部依赖 vs type import"的顺序它可能修不彻底，需要手动调整。

## 4. 关键经验

1. **路径别名要三处同步**：`tsconfig.base.json` 的 `paths`、根 `tsconfig.json` 的 `references`、`jest.config.js` 的 `moduleNameMapper`。漏一处就报错。
2. **覆盖率范围要同步**：`collectCoverageFrom` 不加新服务，覆盖率不统计。
3. **环境变量以 `.env` 为准**，`.env.example` 要同步，否则新同学复制会踩坑。
4. **Prometheus 配置改了要重启**：`docker compose restart prometheus`。
5. **`pnpm-workspace.yaml` 用通配符**：`core/services/*` 自动包含新服务，不用改。
6. **lint 报错先分类**：`.d.ts` 解析错误是文件问题，`require` 是注释过期，`import/order` 是排序问题。分类后逐个击破。
7. **`pnpm lint:fix` 先跑**：能自动修的先自动修，剩下手动的再处理。
8. **验证顺序**：`pnpm install` → `pnpm lint` → `pnpm test:unit` → `pnpm build`。每步确认，不跳步。

---

# 二、阶段二任务回顾（与之前一致）

## 阶段二总体目标

**打通"模拟车 MQTT 上报 → ingest 转发到总线 → data-writer 落 PG/Redis"的主干道。**

## 数据流

```
simulator ──MQTT──→ EMQX ──订阅──→ ingest ──发布──→ 消息总线(telemetry.raw)
                                                          │
                                                          │ 订阅
                                                          ▼
                                                   data-writer
                                                          │
                                          ┌───────────────┼───────────────┐
                                          ▼               ▼               ▼
                                     vehicle_latest  vehicle_telemetry  alerts
                                       (PG UPSERT)      (PG INSERT)    (PG INSERT)
                                          │
                                          ▼
                                       Redis 热路径
```

## 核心规则

1. **只有 Ingest 连外部（MQTT）**，simulator 通过 MQTT 上报，不直接写总线。
2. **只有 Data-Writer 连库（PG/Redis）**。
3. **服务之间零直接调用**，只通过消息总线。
4. **所有服务用 `@apiscloud/libs` 和 `@apiscloud/message-bus`**，不直接引 SDK。
5. **核心服务独立启动**，不走 plugin-host，参照 `observability/server-entry.ts`。
6. **每个服务都暴露 `/metrics` 和 `/health`**，用 `createObservabilityService`。

## 三个服务的定位

| 服务 | 角色 | 输入 | 输出 |
|---|---|---|---|
| simulator | 外部系统替身 | 内部状态机 | MQTT 上报 `telemetry/raw` |
| ingest | 唯一外部出入口 | MQTT 订阅 | 总线 `telemetry.raw`；总线订阅 → MQTT 下行 |
| data-writer | 唯一写库者 | 总线 `telemetry.raw`、`telemetry.aggregated`、`events.alerts` | PG + Redis |

## 阶段二任务清单

| 序号 | 任务 | 产出 |
|---|---|---|
| 2.0 | 根配置改动 | `tsconfig.base.json`、`tsconfig.json`、`jest.config.js`、`.env`、`.env.example`、`prometheus.yml` |
| 2.1 | 开发 simulator | `core/services/simulator/` 完整实现 |
| 2.2 | 开发 ingest | `core/services/ingest/` 完整实现 |
| 2.3 | 开发 data-writer | `core/services/data-writer/` 完整实现 |
| 2.4 | 主题确认 | 用 `TOPICS` 常量，不硬编码 |
| 2.5 | simulator 测试 | `tests/simulator.*.test.ts` |
| 2.6 | ingest 测试 | `tests/ingest.*.test.ts` |
| 2.7 | data-writer 测试 | `tests/dataWriter.*.test.ts` |
| 2.8 | 集成测试 | `tests/integration.mqttToPg.test.ts` |
| 2.9 | 文档 | `docs/simulator.V1.md`、`docs/ingest.V1.md`、`docs/dataWriter.V1.md`、`docs/messageBus.V2.md` |

## destination.md 里的阶段二任务

| 序号 | 任务 | 怎么完成 | 产出 |
|---|---|---|---|
| 2.1 | 开发 simulator | 状态机 + GPS 生成器，500 辆模拟 | `core/services/simulator/` |
| 2.2 | 开发 ingest | 订阅 MQTT，转发消息总线；订阅总线，下发 MQTT | `core/services/ingest/` |
| 2.3 | 开发 data-writer | 消费消息总线，写 PG 和 Redis | `core/services/data-writer/` |
| 2.4 | 定义消息总线主题 | 创建 4 个主题，设置分区和保留策略 | 主题配置 |
| 2.5 | 编写 simulator 测试 | 单元测试：状态机、车辆数量 | `simulator.stateMachine.test.js` |
| 2.6 | 编写 ingest 测试 | 单元测试：MQTT 转总线、下行命令 | `ingest.mqttToBus.test.js` |
| 2.7 | 编写 data-writer 测试 | 单元测试：PG 插入、Upsert | `dataWriter.pgInsert.test.js` |
| 2.8 | 编写消息总线测试 | 单元测试：各适配器、切换 | `messageBus.*.test.js` |
| 2.9 | 编写集成测试 | MQTT → 消息总线 → PG 全链路 | `integration.mqttToPg.test.js` |
| 2.10 | 编写功能文档 | 每个功能一个文档 | `simulator.V1.md` 等 |

## 阶段二验收标准

| 项 | 标准 |
|---|---|
| 类型检查 | `make typecheck` 通过 |
| Lint | `make lint` 通过 |
| 单元测试 | `make test-unit` 通过 |
| 构建 | `make build` 通过 |
| Registry | `make registry-check` 通过 |
| 数据流 | simulator 发 MQTT → ingest 转总线 → data-writer 写 PG/Redis |
| 可观测 | 三个服务 `/metrics`、`/health` 可访问 |
| 总线可切换 | `MESSAGE_BUS=memory` 和 `MESSAGE_BUS=mqtt` 都能跑 |
| 文档 | 四篇 V1 文档就位 |

## 阶段二阶段文档

- `docs/simulator.V1.md`
- `docs/ingest.V1.md`
- `docs/dataWriter.V1.md`
- `docs/messageBus.V2.md`

---

# 三、下一步

阶段 2.0 完成，进入 **阶段 2.1：开发 simulator**。

阶段 2.1 要创建这些文件：

```
core/services/simulator/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts
    ├── config.ts
    ├── state-machine.ts
    ├── gps-generator.ts
    ├── vehicle.ts
    ├── fleet.ts
    ├── mqtt-publisher.ts
    └── service.ts
```

**请确认：是否从阶段 2.1 的 `package.json` 和 `tsconfig.json` 开始，逐文件输出？**