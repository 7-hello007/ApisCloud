# 测试规范 V1

## 一、功能目标

定义 ApisCloud 的三层测试体系、命名规范、覆盖率要求和最佳实践。

## 二、三层测试

| 层 | 前缀 | 依赖 | 用途 | 执行时间 |
|---|---|---|---|---|
| 单元测试 | 无 | Mock | 验证单个函数/模块 | 毫秒 |
| 集成测试 | `integration.` | MemoryAdapter + Mock | 验证多个服务组合 | 秒 |
| 端到端测试 | `e2e.` | MemoryAdapter + Mock | 验证完整数据流 | 秒~十几秒 |

**重要：`integration.*` 和 `e2e.*` 都用 MemoryAdapter，不需要真实 Kafka/PG/Redis。** 真实基础设施验证通过 `scripts/verify-e2e.sh` 手动跑。

## 三、目录结构

```
tests/
├── README.md
├── setup.js
├── helpers/
│   ├── index.ts
│   ├── envelope.ts             — makeEnvelope
│   ├── plugin.ts               — makePlugin
│   ├── wait.ts                 — waitFor、delay
│   ├── e2e-infra.ts            — e2e 共享 mock
│   └── e2e-setup.ts            — e2e 环境准备/清理
├── <功能>.<说明>.test.ts       — 单元
├── integration.*.test.ts       — 集成
└── e2e.*.test.ts               — 端到端
```

## 四、命名规范

```
功能名.（附加说明，1-4 个驼峰单词）.test.ts
```

**示例：**

| 文件名 | 层级 | 说明 |
|---|---|---|
| `dispatch.nearest.test.ts` | 单元 | dispatch 的 nearest 算法 |
| `ingest.validation.test.ts` | 单元 | ingest 输入校验 |
| `pluginHost.host.test.ts` | 单元 | plugin-host 的 host 模块 |
| `integration.mqttToPg.test.ts` | 集成 | MQTT → 总线 → PG |
| `integration.dispatchFlow.test.ts` | 集成 | 调度流 |
| `integration.alertFlow.test.ts` | 集成 | 告警流 |
| `integration.gatewayToDataWriter.test.ts` | 集成 | gateway → data-writer |
| `integration.pluginEcosystem.test.ts` | 集成 | 插件生态 |
| `e2e.fullPipeline.test.ts` | e2e | 全链路 |
| `e2e.frontendApi.test.ts` | e2e | 前端 API |

## 五、测试命令

| 命令 | 作用 |
|---|---|
| `make test` | 全部测试 |
| `make test-unit` | 只跑单元 |
| `make test-integration` | 只跑集成 |
| `make test-e2e` | 只跑 e2e |
| `make test-coverage` | 带覆盖率 |
| `make test-watch` | 监听模式 |
| `make test-file FILE=...` | 跑单个文件 |
| `./scripts/test.sh check` | 完整验证（lint + typecheck + 全部测试） |

## 六、覆盖率

### 6.1 目标

| 维度 | 阈值 |
|---|---|
| 行覆盖 | ≥ 60% |
| 函数覆盖 | ≥ 60% |
| 分支覆盖 | ≥ 50% |
| 语句覆盖 | ≥ 60% |

### 6.2 排除

- `**/types.ts`
- `**/index.ts`
- `**/*.d.ts`
- `**/node_modules/**`
- `**/dist/**`

### 6.3 命令

```bash
make test-coverage
# 报告在 coverage/index.html
```

## 七、测试辅助

### 7.1 `makeEnvelope`

```ts
import { makeEnvelope } from './helpers';

const env = makeEnvelope({
  topic: TOPICS.TELEMETRY_RAW,
  source: 'test',
  payload: { vehicle_id: 'v-1' },
});
```

### 7.2 `makePlugin`

```ts
import { makePlugin } from './helpers';

const loaded = makePlugin('test-plugin', {
  onLoad: jest.fn(),
  onMessage: jest.fn(),
});
```

### 7.3 `waitFor`

```ts
import { waitFor } from './helpers';

await waitFor(() => mockPg.queries.length >= 1);
await waitFor(() => received.length === 3, { timeoutMs: 5000 });
```

### 7.4 e2e 共享 mock

```ts
import {
  createMockPg,
  createMockRedis,
  createMockMqttSubscriber,
  createMockMqttPublisher,
  makeTelemetry,
} from './helpers/e2e-infra';
```

### 7.5 e2e 环境

```ts
import { createE2eEnv, destroyE2eEnv, pushTelemetry } from './helpers/e2e-setup';

const env = await createE2eEnv();
pushTelemetry(env, makeTelemetry('v-000001'));
await destroyE2eEnv(env);
```

## 八、写测试的原则

### 8.1 单元测试

- **纯函数优先**：Haversine、状态机、目标函数、约束过滤，都是纯函数，测试简单。
- **用 `it.each` 覆盖多情况**：如 5 种 status 都拒绝。
- **边界值必测**：0、1、最大值、空列表、null。
- **断言语义，不断言实现**：如验证 "score 降序"，不验证具体值。

### 8.2 集成测试

- **共享 MemoryAdapter**：让多个服务在同一进程内互通。
- **Mock 外部依赖**：MQTT、PG、Redis 都用 mock。
- **可注入依赖**：`createXxxService({ bus, pg, redis })`。
- **覆盖正常 + 边界 + 规模**：如 1 条、100 条、500 条。

### 8.3 e2e 测试

- **覆盖完整链路**：从输入到输出，跨越 3+ 服务。
- **用 `e2e-setup.ts` 管理环境**：不重复写 setup/teardown。
- **验证关键节点**：MQTT 收到了什么、PG 写入了什么、Redis 存了什么。

### 8.4 不要做的事

| 反模式 | 原因 |
|---|---|
| 直接替换 mock 的方法（`mockPg.query = ...`） | 会丢失 `queries.push`，测试断链 |
| 依赖时间戳绝对值 | 用相对时间或 `toBeCloseTo` |
| 依赖标签顺序 | prom-client 标签顺序是定义顺序，用 `toContain` 分开验证 |
| 测试里 `await new Promise(r => setTimeout(r, N))` | 用 `waitFor` |
| 断言具体的 `Date.now()` | 用范围或 mock 时间源 |

## 九、修复测试的流程

### 9.1 常见错误及修复

| 错误 | 原因 | 修复 |
|---|---|---|
| `TS6133: X is declared but never read` | 未使用的 import | 删掉 |
| `TS2352: Conversion of type ... may be a mistake` | 类型断言过强 | 不用 `as`，写完整字段 |
| `TS2741: Property 'X' is missing` | 接口加字段，mock 没同步 | 补上字段 |
| `waitFor 超时` | 条件永不成立 | 检查 mock 是否正确推入数据 |
| `EADDRINUSE` | 端口被占 | `make stop` 或换端口 |
| `expect(received).toContain(...)` 失败 | 标签顺序、格式变化 | 用 `extractMetricLines` 分离断言 |

### 9.2 调试技巧

```bash
# 跑单个文件
pnpm exec jest tests/xxx.test.ts

# 跑关键字
pnpm exec jest gateway

# 带详细输出
pnpm exec jest --verbose

# 只看失败
pnpm exec jest --onlyFailures

# 清理缓存
pnpm exec jest --clearCache
```

## 十、真实基础设施验证

单元/集成/e2e 都用 mock。**真实基础设施验证用脚本：**

```bash
# 端到端验证（真实 Kafka/PG/Redis）
./scripts/verify-e2e.sh

# 多规模验证（500 / 1000 / 2000 辆车）
./scripts/verify-multi-scale.sh
```

**这两个脚本会检查 8 项：**

1. 基础设施容器健康
2. Kafka 主题存在
3. 后端服务健康
4. 遥测端到端（Kafka → PG + Redis）
5. 告警端到端（geofence → PG）
6. Prometheus 抓取
7. Grafana 仪表板
8. 汇总

## 十一、V1 修改

无（首版）。

## 十二、后续版本

### 阶段六之后

- 添加 `e2e.fullUserJourney.test.ts`：从提交任务到 MQTT 下发的完整用户旅程
- 添加性能测试：MemoryAdapter 发 10000 条消息测吞吐
- 添加契约测试：验证消息格式兼容性
- 添加混沌测试：模拟网络分区、服务宕机

### 长期

- testcontainers 集成测试（真实 PG/Kafka 容器）
- 快照测试（前端组件）
- 视觉回归测试（前端页面）