#!/usr/bin/env bash
#
# ApisCloud 一键启动
#
# 用法：
#   ./scripts/start.sh                        默认 PROFILE=core LAYERS=single
#   ./scripts/start.sh PROFILE=full           启动 full profile
#   ./scripts/start.sh LAYERS=multi           启动多层
#   ./scripts/start.sh --no-front             不启动前端
#   ./scripts/start.sh --no-infra             不启动基础设施
#
# 环境变量：
#   PROFILE   core | full         默认 core
#   LAYERS    single | multi      默认 single
#
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# ============================================================
# 参数解析
# ============================================================

PROFILE="${PROFILE:-core}"
LAYERS="${LAYERS:-single}"
PASSTHROUGH=()

for arg in "$@"; do
  case "$arg" in
    PROFILE=*) PROFILE="${arg#PROFILE=}" ;;
    LAYERS=*)  LAYERS="${arg#LAYERS=}" ;;
    -h|--help)
      cat <<'USAGE'
用法: ./scripts/start.sh [PROFILE=core|full] [LAYERS=single|multi] [选项]

环境变量:
  PROFILE   插件 profile（core | full）  默认 core
  LAYERS    层（single | multi）         默认 single

透传给 dev-up.sh 的选项:
  --no-infra    不启动基础设施
  --no-backend  不启动后端
  --no-front    不启动前端
  --no-build    跳过构建
  -h, --help    显示帮助
USAGE
      exit 0
      ;;
    --no-infra|--no-backend|--no-front|--no-build)
      PASSTHROUGH+=("$arg")
      ;;
    *)
      echo "[start] 未知参数: $arg" >&2
      exit 1
      ;;
  esac
done

if [ "$PROFILE" != "core" ] && [ "$PROFILE" != "full" ]; then
  echo "[start] 非法 PROFILE=$PROFILE（可选：core | full）" >&2
  exit 1
fi

if [ "$LAYERS" != "single" ] && [ "$LAYERS" != "multi" ]; then
  echo "[start] 非法 LAYERS=$LAYERS（可选：single | multi）" >&2
  exit 1
fi

# ============================================================
# 导出环境变量，dev-up.sh 会读取
# ============================================================

export PROFILE
export LAYERS
# gateway 用这个决定加载哪些插件
export GATEWAY_PROFILE="$PROFILE"
# layer-config 读取（阶段六先用环境变量传递，后续版本改为文件切换）
export APISCLOUD_LAYERS="$LAYERS"

echo "[start] PROFILE=$PROFILE LAYERS=$LAYERS"

# ============================================================
# 调用 dev-up.sh
# ============================================================

exec "$ROOT/scripts/dev-up.sh" "${PASSTHROUGH[@]}"
