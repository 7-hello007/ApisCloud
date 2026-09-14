# 测试目录

扁平结构，按命名前缀区分层级。

---

## 命名规范

```
功能名.（附加说明【一至四个单词，驼峰式】）.test.ts
```

示例：

| 文件 | 说明 |
|---|---|
| libs.config.test.ts | libs 的 config 模块单元测试 |
| messageBus.memoryAdapter.test.ts | 消息总线的 memory 适配器单元测试 |
| pluginHost.loadPlugin.test.ts | 插件宿主的 loadPlugin 功能单元测试 |
| integration.mqttToPg.test.ts | 集成测试：MQTT 到 PG 的链路 |
| e2e.fullPipeline.test.ts | 端到端测试：完整数据流 |

---

## 层级区分

| 前缀 | 层级 | 说明 |
|---|---|---|
| 无前缀 | 单元测试 | Mock 外部依赖，只测本模块逻辑 |
| integration. | 集成测试 | 多服务组合，共享 MemoryAdapter |
| e2e. | 端到端测试 | 完整数据流，从入口到出口 |

**单元测试**：每个模块独立测试，外部依赖全部 mock 或注入。

**集成测试**：跨模块协作，用共享 MemoryAdapter 在同一进程内跑通。

**端到端测试**：完整数据流，如 `simulator → MQTT → ingest → 总线 → data-writer → PG/Redis`，验证闭环。

**关键原则**：`integration.*` 和 `e2e.*` 都**用 MemoryAdapter**，不需要真实 Kafka/PG/Redis。真实基础设施验证通过 `scripts/verify-e2e.sh` 手动跑。

---

## 命令

| 命令 | 作用 |
|---|---|
| make test | 全部测试 |
| make test-unit | 只跑单元测试 |
| make test-integration | 只跑集成测试 |
| make test-e2e | 只跑端到端测试 |
| make test-coverage | 带覆盖率 |
| make test-watch | 监听模式，改文件自动跑 |
| make test-file FILE=path | 只跑某个文件 |
| make test FILTER=dispatch | 只跑名字含 dispatch 的测试 |
| make test FILTER=plugins | 只跑插件测试 |
| make test FILTER=messageBus | 只跑消息总线测试 |
| make test FILTER=layerConfig | 只跑层配置测试 |

---

## 写作模板

```
import { something } from '@apiscloud/some-package';

describe('模块名.功能名', () => {
  // 共享 setup
  beforeEach(() => {
    // 重置状态
  });

  afterEach(() => {
    // 清理资源
  });

  describe('子功能', () => {
    it('正常路径描述', () => {
      // Arrange
      const input = ...;

      // Act
      const result = ...;

      // Assert
      expect(result).toBe(...);
    });

    it('边界条件描述', () => {
      // ...
    });

    it('错误路径描述', () => {
      expect(() => ...).toThrow();
    });
  });
});
```

---

## 测试分层原则

| 层级 | Mock 程度 | 依赖 | 运行时间 |
|---|---|---|---|
| 单元 | 全部 mock | 无 | 毫秒级 |
| 集成 | 部分 mock，共享 MemoryAdapter | 无 Docker | 秒级 |
| 端到端 | 共享 MemoryAdapter，全部服务组合 | 无 Docker | 秒级到十几秒 |

优先级：单元测试最多，集成测试其次，端到端测试最少。

**真实验证**：需要验证 Kafka/MQTT/PG/Redis 的真实行为时，用 `scripts/verify-e2e.sh` 手动跑（启动真实基础设施 + 全部服务 + 数据流断言）。

---

## 覆盖率

覆盖率报告在 `coverage/`，HTML 报告入口 `coverage/lcov-report/index.html`。

阈值：

| 指标 | 阈值 |
|---|---|
| 行覆盖率（lines） | 60% |
| 函数覆盖率（functions） | 60% |
| 分支覆盖率（branches） | 50% |
| 语句覆盖率（statements） | 60% |

随着测试完善，逐步提高阈值。

排除：

- `**/*.d.ts` — 类型声明
- `**/index.ts` — 纯导出文件
- `**/types.ts` — 纯类型文件
- `core/registry/**` — 生成产物
- `scripts/**` — 构建脚本

---

## 测试辅助

测试辅助函数在 `tests/helpers/`：

| 文件 | 作用 |
|---|---|
| `envelope.ts` | 创建测试用 Envelope（`makeEnvelope`） |
| `plugin.ts` | 创建测试用插件（`makePlugin`、`makePluginInstance`） |
| `wait.ts` | 等待条件成立（`waitFor`、`delay`） |
| `e2e-infra.ts` | e2e 共享 mock（`MockPg`、`MockRedis`、`MockMqttSubscriber`、`MockMqttPublisher`、`makeTelemetry`） |
| `e2e-setup.ts` | e2e 环境准备/清理（`createE2eEnv`、`destroyE2eEnv`、`pushTelemetry`） |
| `index.ts` | 统一出口 |

### `makeEnvelope`

创建测试用 Envelope：

```ts
const env = makeEnvelope({
  topic: TOPICS.TELEMETRY_RAW,
  source: 'test',
  payload: { ... },
});
```

### `makePlugin`

创建测试用 LoadedPlugin：

```ts
const loaded = makePlugin('test-plugin', {
  onLoad: jest.fn(),
  onMessage: jest.fn(),
});
```

### `waitFor`

等异步条件成立：

```ts
await waitFor(() => mockPg.queries.length >= 1);
await waitFor(() => received.length === 3, { timeoutMs: 5000 });
```

### e2e 共享 mock

```ts
import {
  createMockPg,
  createMockRedis,
  createMockMqttSubscriber,
  createMockMqttPublisher,
} from './helpers/e2e-infra';

const pg = createMockPg();
const redis = createMockRedis();
```

### e2e 环境

```ts
import { createE2eEnv, destroyE2eEnv, pushTelemetry } from './helpers/e2e-setup';
import { makeTelemetry } from './helpers/e2e-infra';

const env = await createE2eEnv();
pushTelemetry(env, makeTelemetry('v-000001'));
await destroyE2eEnv(env);
```

---

## 测试文件清单

### 单元测试

| 文件 | 覆盖 |
|---|---|
| `libs.config.test.ts` | config 模块 |
| `libs.health.test.ts` | health 模块 |
| `libs.metrics.test.ts` | metrics 模块 |
| `libs.security.test.ts` | security 模块 |
| `messageBus.envelope.test.ts` | Envelope |
| `messageBus.memory.test.ts` | MemoryAdapter |
| `messageBus.switch.test.ts` | 总线切换 |
| `messageBus.topics.test.ts` | 主题常量 |
| `messageBus.partition.test.ts` | 按车辆分区 |
| `messageBus.switchVerification.test.ts` | 总线切换验证 |
| `layerConfig.load.test.ts` | 层配置加载 |
| `layerConfig.addLayer.test.ts` | 加层 |
| `layerConfig.multiLayer.test.ts` | 多层配置 |
| `pluginHost.loadPlugin.test.ts` | 插件加载 |
| `pluginHost.registry.test.ts` | 注册表 |
| `pluginHost.guard.test.ts` | 超时/异常保护 |
| `pluginHost.host.test.ts` | PluginHost 方法 |
| `pluginHost.busInjection.test.ts` | bus 注入 |
| `pluginHost.filter.test.ts` | filter 机制 |
| `pluginHost.lazySubscription.test.ts` | 懒订阅 |
| `observability.collect.test.ts` | 指标采集 |
| `registry.build.test.ts` | registry 生成 |
| `security.jwt.test.ts` | JWT |
| `security.auth.test.ts` | 认证 |
| `security.commandSignature.test.ts` | 指令签名 |
| `security.rateLimiter.test.ts` | 限流 |
| `security.replayGuard.test.ts` | 防重放 |
| `security.secrets.test.ts` | 密钥管理 |
| `simulator.stateMachine.test.ts` | 状态机 |
| `simulator.gpsGenerator.test.ts` | GPS |
| `simulator.vehicle.test.ts` | 单车 |
| `simulator.fleet.test.ts` | 车队 |
| `simulator.config.test.ts` | 配置 |
| `ingest.validation.test.ts` | 上行/下行校验 |
| `ingest.mapper.test.ts` | 映射 |
| `ingest.config.test.ts` | 配置 |
| `ingest.mqttToBus.test.ts` | 上行链路 |
| `ingest.busToMqtt.test.ts` | 下行链路 |
| `dataWriter.config.test.ts` | 配置 |
| `dataWriter.mapper.test.ts` | 映射 |
| `dataWriter.pgWriter.test.ts` | PG 写入 |
| `dataWriter.redisWriter.test.ts` | Redis 写入 |
| `dataWriter.handlers.test.ts` | 三个 handler |
| `dataWriter.eventsCommands.test.ts` | events.commands handler |
| `dataWriter.query.test.ts` | 查询端点 |
| `dispatch.nearest.test.ts` | nearest 算法 |
| `dispatch.batchMatch.test.ts` | batch-match 算法 |
| `dispatch.priority.test.ts` | priority 算法 |
| `geofence.zoneDetection.test.ts` | 围栏检测 |
| `anomaly.speedThreshold.test.ts` | 异常检测 |
| `aggregator.window.test.ts` | 时间窗 |
| `aggregator.aggregator.test.ts` | 聚合逻辑 |
| `chargingScheduler.detectors.test.ts` | 充电检测 |
| `chargingScheduler.plugin.test.ts` | 充电插件 |
| `routeOptimizer.optimizer.test.ts` | 路线优化 |
| `routeOptimizer.plugin.test.ts` | 路线优化插件 |
| `reporting.reports.test.ts` | 报表汇总 |
| `reporting.plugin.test.ts` | 报表插件 |
| `gateway.router.test.ts` | gateway 路由 |
| `gateway.config.test.ts` | gateway 配置 |
| `gateway.pluginIntegration.test.ts` | gateway + 插件 |

### 集成测试

| 文件 | 覆盖 |
|---|---|
| `integration.mqttToPg.test.ts` | MQTT → 总线 → PG |
| `integration.dispatchFlow.test.ts` | 调度流 |
| `integration.alertFlow.test.ts` | 告警流 |
| `integration.gatewayApi.test.ts` | gateway API |
| `integration.pluginEcosystem.test.ts` | 插件生态完整链路 |

### 端到端测试

| 文件 | 覆盖 |
|---|---|
| `e2e.fullPipeline.test.ts` | simulator → MQTT → ingest → 总线 → data-writer → PG/Redis |
| `e2e.frontendApi.test.ts` | gateway → data-writer query → HTTP 响应 |

---

## 相关文档

- [插件宿主](../docs/pluginHost.V1.md)
- [消息总线](../docs/messageBus.V1.md)
- [层配置](../docs/layerConfig.V1.md)
- [可观测性](../docs/observability.V1.md)
- [CI/CD](../docs/cicd.V1.md)
- [部署](../docs/deployment.V1.md)