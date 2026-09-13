#!/usr/bin/env bash
#
# ApisCloud 开发环境关闭
#
# 用法：
#   ./scripts/dev-down.sh            停止后端 + 前端（保留基础设施）
#   ./scripts/dev-down.sh --all      停止所有（含基础设施）
#   ./scripts/dev-down.sh --reset    停止所有并删除数据卷
#   ./scripts/dev-down.sh --keep-infra 只停后端和前端
#
set -uo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# ============================================================
# 参数解析
# ============================================================

STOP_INFRA=true
RESET=false

for arg in "$@"; do
  case "$arg" in
    --keep-infra) STOP_INFRA=false ;;
    --all)        STOP_INFRA=true ;;
    --reset)      STOP_INFRA=true; RESET=true ;;
    -h|--help)
      cat <<'USAGE'
用法: ./scripts/dev-down.sh [选项]

选项:
  --keep-infra  只停后端和前端，保留基础设施
  --all         停所有（含基础设施），保留数据
  --reset       停所有并删除数据卷
  -h, --help    显示帮助
USAGE
      exit 0
      ;;
    *)
      echo "未知参数: $arg" >&2
      exit 1
      ;;
  esac
done

PID_DIR="$ROOT/.pids"

# ============================================================
# 工具函数
# ============================================================

info()  { printf '\033[1;34m[dev-down]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[dev-down]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[dev-down]\033[0m %s\n' "$*"; }

stop_one() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"

  if [ ! -f "$pid_file" ]; then
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"

  if ! kill -0 "$pid" 2>/dev/null; then
    warn "$name 已不在运行，清理 pid 文件"
    rm -f "$pid_file"
    return 0
  fi

  info "停止 $name (pid=$pid) ..."
  # 先尝试优雅关闭（SIGTERM）
  kill -TERM "$pid" 2>/dev/null || true

  # 最多等 5 秒
  for i in $(seq 1 50); do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done

  # 强制 kill
  if kill -0 "$pid" 2>/dev/null; then
    warn "$name 未响应 SIGTERM，强制 kill"
    kill -KILL "$pid" 2>/dev/null || true
  fi

  rm -f "$pid_file"
  ok "$name 已停止"
}

# ============================================================
# 1. 停止前端
# ============================================================

info "=== 停止前端 ==="
stop_one web

# 保险：kill 所有 vite 进程（避免 pid 文件丢失时残留）
if pgrep -f "vite" >/dev/null 2>&1; then
  warn "发现残留 vite 进程，清理中"
  pkill -f "vite" 2>/dev/null || true
fi

# ============================================================
# 2. 停止后端服务（逆序）
# ============================================================

info "=== 停止后端服务 ==="
stop_one gateway
stop_one simulator
stop_one ingest
stop_one dispatch-core
stop_one data-writer
stop_one aggregator

# 保险：kill 残留 node dist/server-entry 进程
if pgrep -f "core/services/.*/dist/server-entry.js" >/dev/null 2>&1; then
  warn "发现残留后端进程，清理中"
  pkill -f "core/services/.*/dist/server-entry.js" 2>/dev/null || true
fi

# ============================================================
# 3. 基础设施
# ============================================================

if [ "$STOP_INFRA" = true ]; then
  info "=== 停止基础设施 ==="
  if [ "$RESET" = true ]; then
    make infra-reset
    ok "基础设施已停止，数据卷已删除"
  else
    make infra-down
    ok "基础设施已停止（数据保留）"
  fi
else
  info "保留基础设施（--keep-infra）"
fi

echo ""
ok "============================"
ok "  ApisCloud 已停止"
ok "============================"
echo ""
