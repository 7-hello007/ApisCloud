#!/usr/bin/env bash
#
# ApisCloud 测试脚本
#
# 用法：
#   ./scripts/test.sh             跑全部（默认）
#   ./scripts/test.sh unit        只跑单元
#   ./scripts/test.sh integration 只跑集成
#   ./scripts/test.sh e2e         只跑 e2e
#   ./scripts/test.sh all         全部
#   ./scripts/test.sh coverage    带覆盖率
#   ./scripts/test.sh lint        代码检查
#   ./scripts/test.sh typecheck   类型检查
#   ./scripts/test.sh check       完整验证（lint + typecheck + unit + integration + e2e）
#
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

COMMAND="${1:-all}"

info()  { printf '\033[1;34m[test]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[test]\033[0m %s\n' "$*"; }
err()   { printf '\033[1;31m[test]\033[0m %s\n' "$*" >&2; }

run_lint() {
  info "lint ..."
  pnpm lint
  ok "lint 通过"
}

run_typecheck() {
  info "typecheck ..."
  pnpm typecheck
  ok "typecheck 通过"
}

run_unit() {
  info "unit tests ..."
  pnpm exec jest --testPathIgnorePatterns='integration|e2e'
  ok "unit tests 通过"
}

run_integration() {
  info "integration tests ..."
  pnpm exec jest --testPathPattern='integration' --passWithNoTests
  ok "integration tests 通过"
}

run_e2e() {
  info "e2e tests ..."
  pnpm exec jest --testPathPattern='e2e' --passWithNoTests
  ok "e2e tests 通过"
}

run_coverage() {
  info "coverage ..."
  pnpm exec jest --coverage
  ok "coverage 完成，报告在 coverage/"
}

case "$COMMAND" in
  lint)        run_lint ;;
  typecheck)   run_typecheck ;;
  unit)        run_unit ;;
  integration) run_integration ;;
  e2e)         run_e2e ;;
  coverage)    run_coverage ;;
  all)
    run_unit
    run_integration
    run_e2e
    ok "全部测试通过"
    ;;
  check)
    run_lint
    run_typecheck
    run_unit
    run_integration
    run_e2e
    ok "完整验证通过"
    ;;
  *)
    err "未知命令：$COMMAND"
    echo "可用命令：lint | typecheck | unit | integration | e2e | coverage | all | check"
    exit 1
    ;;
esac
