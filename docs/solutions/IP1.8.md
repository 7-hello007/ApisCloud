# 一、阶段 1.8 CI 配置 · 经验总结

## 1. 完成了什么

阶段 1.8 结束时，项目具备以下 CI/CD 能力：

| 类别 | 文件 | 能力 |
|---|---|---|
| 主 CI | `.github/workflows/ci.yml` | 5 个并行 job：lint、typecheck、test-unit、build、registry-check，外加 ci-success 汇总 |
| 安全扫描 | `.github/workflows/security.yml` | 2 个 job：gitleaks 密钥扫描、pnpm audit 依赖漏洞扫描，外加 security-success 汇总 |
| 依赖更新 | `.github/dependabot.yml` | npm、GitHub Actions、Docker 三个生态每周自动提 PR，按类型分组减少噪音 |
| PR 模板 | `.github/PULL_REQUEST_TEMPLATE.md` | 变更类型、描述、关联 Issue、检查清单 |
| Issue 模板 | `.github/ISSUE_TEMPLATE/bug_report.md` | 标准化 Bug 报告格式 |
| 密钥白名单 | `.gitleaks.toml` | 排除 `.env.example` 等示例文件，避免误报 |
| 格式忽略 | `.prettierignore` | 加上 `.github/`，避免 YAML/Markdown 被格式化 |
| README 徽章 | `README.md` | CI、Security 状态徽章 |

### CI 流水线结构

| Job | 作用 | 超时 |
|---|---|---|
| lint | ESLint + Prettier 检查 | 10 min |
| typecheck | `tsc -b` 全项目类型检查 | 10 min |
| test-unit | Jest 单测 + 覆盖率上传 | 15 min |
| build | `pnpm -r build` 全项目构建 | 15 min |
| registry-check | `make build-registry` + JSON 校验 | 5 min |
| ci-success | 汇总所有 job 状态，用于分支保护 | — |

### 安全流水线结构

| Job | 作用 | 超时 |
|---|---|---|
| secret-scan | gitleaks 扫硬编码密钥 | 10 min |
| dependency-audit | pnpm audit 扫高危漏洞 | 10 min |
| security-success | 汇总，用于分支保护 | — |

## 2. 怎么完成的

按这个顺序推进：

1. **建目录**：`.github/workflows/`、`.github/ISSUE_TEMPLATE/`。
2. **写 `ci.yml`**：5 个并行 job + 1 个汇总 job；用 `concurrency` 取消重复触发；`cache: 'pnpm'` 缓存依赖；`--frozen-lockfile` 锁定依赖。
3. **写 `security.yml`**：gitleaks + pnpm audit，加 `schedule.cron` 每周一自动跑。
4. **写 `dependabot.yml`**：3 个生态，`groups` 按类型合并 PR。
5. **写 `PULL_REQUEST_TEMPLATE.md`**：含检查清单，特别是核心契约改动的说明。
6. **写 `bug_report.md`**：标准化 Issue。
7. **写 `.gitleaks.toml`**：白名单排除 `.env.example`、`docs/*.md`、`tests/*.test.ts`。
8. **更新 `.prettierignore`**：加 `.github/`。
9. **更新 `README.md`**：加 CI/Security 徽章。
10. **本地验证 YAML 语法**：用 node 的 `yaml` 库或 Python 验证。
11. **提交并推送到 GitHub**：观察 Actions 运行结果。

## 3. 遇到了什么问题

阶段 1.8 踩了 1 个坑：

| # | 问题 | 表现 |
|---|---|---|
| 1 | GitHub Rulesets 在私有仓库不生效 | 页面提示 “Your rulesets won't be enforced on this private repository until you move to GitHub Team organization account” |

## 4. 怎么解决的

| # | 解决方案 |
|---|---|
| 1 | 提供三个选项：A. 升级到 GitHub Team；B. 把仓库改为 public；C. 暂时不配，等要公开或加人时再配。推荐 C，先推进阶段一剩余任务 |

**推荐的 Ruleset 配置（若能生效）：**

| 项 | 值 |
|---|---|
| Ruleset Name | `protect-main` |
| Enforcement | Active |
| Target branches | `main`、`develop` |
| Restrict deletions | ✅ |
| Require linear history | ✅ |
| Require a pull request | ✅，1 approval |
| Require status checks | ✅，填 `CI Success` 和 `Security Success` |
| Block force pushes | ✅ |
| 其余规则 | 不勾 |

**关键点：** Required checks 只填汇总 job（`CI Success`、`Security Success`），不填每个子 job，这样未来增删子 job 不用改 ruleset。

## 5. 关键经验

1. **CI 只填汇总 job 做分支保护**。`ci-success` 已经检查了所有子 job 的结果，规则简洁且易维护。
2. **`concurrency` 取消重复触发**。同一分支多次 push 时，只跑最新的，省资源。
3. **`--frozen-lockfile` 是 CI 的铁律**。防止 CI 里意外更新 lockfile 导致构建漂移。
4. **`cache: 'pnpm'` 由 setup-node 自动处理**。前提是 `pnpm-lock.yaml` 已提交。
5. **`pnpm audit --audit-level=high`** 只让高危失败，中低危仅警告，避免噪音阻塞。
6. **`schedule.cron` 定期跑安全扫描**。不只 push 时跑，每周一也跑一次，抓新披露的漏洞。
7. **gitleaks 需要 `fetch-depth: 0`**。完整 git 历史才能扫所有提交。
8. **gitleaks 白名单很必要**。`.env.example` 里的 `JWT_SECRET=change-me-in-production` 会被误报，加 `.gitleaks.toml` 排除。
9. **Dependabot 的 `groups` 减少噪音**。把 TypeScript、测试、lint 相关依赖合并成一个 PR。
10. **`.prettierignore` 排除 `.github/`**。避免 Prettier 格式化 workflow YAML，破坏 GitHub 的渲染。
11. **PR 模板加「核心契约改动」检查项**。改主题、表结构、plugin.json、registry.json、API 时，PR 里必须说明兼容性影响。
12. **GitHub Rulesets 私有仓库不生效**。这是平台限制，不是配置问题。当前阶段靠 CI 结果 + 自律，等公开或加人时再配。
13. **CD（部署）放到阶段六**。当前还没有可部署的服务，Docker 镜像没构建，部署目标没定。
14. **`act` 可本地模拟运行**。push 前能发现问题，但不能完全模拟 GitHub 环境（secrets 处理等）。

## 6. 阶段 1.8 验收清单

- [x] `.github/workflows/ci.yml` 存在，5 个 job + 1 个汇总
- [x] `.github/workflows/security.yml` 存在，2 个 job + 1 个汇总
- [x] `.github/dependabot.yml` 存在，3 个生态
- [x] `.github/PULL_REQUEST_TEMPLATE.md` 存在
- [x] `.github/ISSUE_TEMPLATE/bug_report.md` 存在
- [x] `.gitleaks.toml` 存在，白名单避免误报
- [x] `.prettierignore` 加上 `.github/`
- [x] README 加了 CI 徽章
- [x] YAML 语法验证通过
- [x] push 到 GitHub 后，Actions 页面能看到运行

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
| 1.9 | 建立 registry | 🟡 部分完成 | 目录、`.gitkeep`、`build-registry.js` 已建，扫描逻辑有骨架 |
| 1.10 | 建立 docs | ⬜ 未开始 | 目录已建，文档未写 |
| 1.11 | 建立 tests | ✅ 已完成 | `jest.config.js`、`setup.js`、`README.md`、冒烟测试已建 |
| 1.12 | 编写安全基础 | 🟡 部分完成 | security 模块在 libs 里已做，独立文档未写 |
| 1.13 | 编写文档 | ⬜ 未开始 | 未做 |

---

## 下一步

原始任务 **1.9 是：建立 registry**。

具体做：

- 完善 `scripts/build-registry.js`：扫描 `core/services/*/plugin.json` 和 `plugins/*/plugin.json`，生成 `core/registry/registry.json`。
- 支持依赖解析：根据 `dependsOn` 做拓扑排序。
- 支持 profile 过滤：按 profile 生成不同视图。
- 支持插件版本记录。
- 输出格式对齐 `core/plugin-host/src/types.ts` 的 `PluginManifest`。
- 测试：`registry.build.test.ts` 验证生成的 registry 合法、拓扑序正确、profile 过滤正确。
- 集成到 CI 的 `registry-check` job（已有）。

需要我继续讲 **阶段 1.9：建立 registry** 吗？