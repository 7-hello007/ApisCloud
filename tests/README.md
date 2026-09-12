# 测试目录

扁平结构，按命名区分层级。

## 命名规则

功能名.（附加说明【一至四个单词，驼峰式】）.test.ts

## 层级

| 前缀 | 层级 | 说明 |
|---|---|---|
| 无前缀 | 单元测试 | Mock 外部依赖 |
| integration. | 集成测试 | 真实总线/PG 或 testcontainers |
| e2e. | 端到端测试 | 完整环境 |

## 命令

- pnpm test
- pnpm test:unit
- pnpm test:integration
- pnpm test:e2e
- pnpm test:coverage