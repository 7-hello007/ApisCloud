# 测试目录

扁平结构，按命名前缀区分层级。

---

## 命名规范

功能名.（附加说明【一至四个单词，驼峰式】）.test.ts

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
| integration. | 集成测试 | 真实总线/PG，或 testcontainers |
| e2e. | 端到端测试 | 完整环境，从入口到出口 |

单元测试：每个模块独立测试，外部依赖全部 mock 或注入。
集成测试：跨模块协作，用真实中间件或 testcontainers。
端到端测试：完整数据流，从 MQTT 进来，到 PG 出去，验证闭环。

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
| 集成 | 真实中间件 | Docker（testcontainers） | 秒级 |
| 端到端 | 无 mock | 完整环境 | 十秒级 |

优先级：单元测试最多，集成测试其次，端到端测试最少。

---

## 覆盖率

覆盖率报告在 coverage/，HTML 报告入口 coverage/lcov-report/index.html。

阈值：

| 指标 | 阈值 |
|---|---|
| 行覆盖率（lines） | 60% |
| 函数覆盖率（functions） | 60% |
| 分支覆盖率（branches） | 50% |
| 语句覆盖率（statements） | 60% |

随着测试完善，逐步提高阈值。

排除：

- **/*.d.ts — 类型声明
- **/index.ts — 纯导出文件
- **/types.ts — 纯类型文件
- core/registry/** — 生成产物
- scripts/** — 构建脚本

---

## 测试辅助

测试辅助函数在 tests/helpers/：

| 文件 | 作用 |
|---|---|
| envelope.ts | 创建测试用 Envelope |
| plugin.ts | 创建测试用插件 |
| wait.ts | 等待条件成立 |
| index.ts | 统一出口 |

---

## 相关文档

- [插件宿主](../docs/pluginHost.V1.md)
- [消息总线](../docs/messageBus.V1.md)
- [层配置](../docs/layerConfig.V1.md)
- [可观测性](../docs/observability.V1.md)
- [CI/CD](../docs/cicd.V1.md)