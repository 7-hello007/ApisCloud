# CI/CD 配置 V1

## 一、功能目标

每次 push 和 PR 自动跑 lint、typecheck、单测、构建、安全扫描。主干代码始终可构建、可测试。

## 二、基础实现

### 2.1 文件位置

```
.github/
├── workflows/
│   ├── ci.yml          — 主 CI 流水线
│   └── security.yml    — 安全扫描
├── ISSUE_TEMPLATE/
│   └── bug_report.md
├── PULL_REQUEST_TEMPLATE.md
└── dependabot.yml
.gitleaks.toml          — 密钥扫描白名单
```

### 2.2 主 CI 流水线

5 个并行 job + 1 个汇总：

| Job | 作用 | 超时 |
|---|---|---|
| lint | ESLint + Prettier 检查 | 10 min |
| typecheck | `tsc -b` 全项目类型检查 | 10 min |
| test-unit | Jest 单测 + 覆盖率上传 | 15 min |
| build | `pnpm -r build` 全项目构建 | 15 min |
| registry-check | `make build-registry` + JSON 校验 | 5 min |
| ci-success | 汇总所有 job 状态 | — |

### 2.3 安全流水线

2 个 job + 1 个汇总：

| Job | 作用 |
|---|---|
| secret-scan | gitleaks 扫硬编码密钥 |
| dependency-audit | pnpm audit 扫高危漏洞 |
| security-success | 汇总 |

每周一自动跑一次，抓新披露漏洞。

### 2.4 Dependabot

3 个生态每周一自动提 PR：

| 生态 | 范围 |
|---|---|
| npm | 依赖 |
| github-actions | Action 版本 |
| docker | Docker 镜像版本 |

按类型分组（typescript、testing、linting、apiscloud），减少噪音。

### 2.5 PR 模板

含检查清单：

- 本地跑通 lint、typecheck、test-unit、build
- 新增/修改功能有测试
- 新增/修改功能有文档
- 未硬编码密钥
- 若改动核心契约，已说明兼容性影响

### 2.6 关键配置

| 项 | 说明 |
|---|---|
| `concurrency` | 同一分支重复触发取消旧的 |
| `--frozen-lockfile` | CI 锁定依赖 |
| `cache: 'pnpm'` | 缓存 pnpm store |
| 汇总 job | 用于分支保护，只填汇总不填子 job |

### 2.7 分支保护（GitHub Rulesets）

推荐配置：

| 项 | 值 |
|---|---|
| Target branches | main、develop |
| Restrict deletions | ✅ |
| Require linear history | ✅ |
| Require a pull request | ✅，1 approval |
| Require status checks | ✅，填 `CI Success` 和 `Security Success` |
| Block force pushes | ✅ |

**当前私有仓库不生效**，需升级 GitHub Team 或改为 public。

## 三、V1 修改

无（首版）。

## 四、后续版本

- 阶段六：补充 CD 流水线（手动部署、按 profile、按层组合）
- 阶段六：补充 Dockerfile 构建
- 阶段六：补充部署后冒烟测试
- 阶段六：补充 CodeQL、覆盖率阈值