#!/usr/bin/env bash
#
# ApisCloud 开发环境一键启动
#
# 用法：
#   ./scripts/dev-up.sh            启动全部（基础设施 + 后端 + 前端）
#   ./scripts/dev-up.sh --no-front 不启动前端
#   ./scripts/dev-up.sh --no-infra 不启动基础设施
#   ./scripts/dev-up.sh --no-build 跳过构建
#
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# ============================================================
# 自动检测 HOST_IP（Docker Desktop for Linux 必须）
# ============================================================

if [ -z "${HOST_IP:-}" ]; then
  DETECTED_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [ -n "$DETECTED_IP" ] && [ "$DETECTED_IP" != "127.0.0.1" ]; then
    HOST_IP="$DETECTED_IP"
    export HOST_IP
    echo "[dev-up] 自动检测宿主机 IP: $HOST_IP"
  fi
fi

# ============================================================
# 参数解析
# ============================================================

START_INFRA=true
START_BACKEND=true
START_FRONTEND=true
START_SIMULATOR=true
DO_BUILD=true

for arg in "$@"; do
  case "$arg" in
    --no-infra)     START_INFRA=false ;;
    --no-backend)   START_BACKEND=false ;;
    --no-front)     START_FRONTEND=false ;;
    --no-build)     DO_BUILD=false ;;
    --no-simulator) START_SIMULATOR=false ;;
    -h|--help)
      cat <<'USAGE'
用法: ./scripts/dev-up.sh [选项]

选项:
  --no-infra     不启动基础设施
  --no-backend   不启动后端服务
  --no-front     不启动前端
  --no-build     跳过构建
  -h, --help     显示帮助
USAGE
      exit 0
      ;;
    *)
      echo "未知参数: $arg" >&2
      exit 1
      ;;
  esac
done

# ============================================================
# 目录 & 日志
# ============================================================

LOG_DIR="$ROOT/logs"
PID_DIR="$ROOT/.pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

# ============================================================
# 工具函数
# ============================================================

info()  { printf '\033[1;34m[dev-up]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[dev-up]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[dev-up]\033[0m %s\n' "$*"; }
err()   { printf '\033[1;31m[dev-up]\033[0m %s\n' "$*" >&2; }

is_running() {
  local pid_file="$1"
  [ -f "$pid_file" ] || return 1
  local pid
  pid="$(cat "$pid_file")"
  kill -0 "$pid" 2>/dev/null
}

start_bg() {
  local name="$1"
  local cmd="$2"
  local pid_file="$PID_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"

  if is_running "$pid_file"; then
    warn "$name 已在运行 (pid=$(cat "$pid_file"))，跳过"
    return 0
  fi

  info "启动 $name ..."
  (
    cd "$ROOT"
    nohup bash -c "$cmd" > "$log_file" 2>&1 &
    echo $! > "$pid_file"
  )
  sleep 0.5

  if is_running "$pid_file"; then
    ok "$name 已启动 (pid=$(cat "$pid_file"), log=$log_file)"
  else
    err "$name 启动失败，查看 $log_file"
    return 1
  fi
}

# ============================================================
# 1. 基础设施
# ============================================================

# ============================================================
# 检测 HOST_IP（如果 shell 没设）
# ============================================================

if [ -z "${HOST_IP:-}" ]; then
  # 尝试从 hostname -I 拿第一个非 loopback IP
  DETECTED_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [ -n "$DETECTED_IP" ] && [ "$DETECTED_IP" != "127.0.0.1" ]; then
    HOST_IP="$DETECTED_IP"
    export HOST_IP
    info "自动检测到宿主机 IP：$HOST_IP（可通过 export HOST_IP=... 覆盖）"
  else
    info "未检测到宿主机 IP，使用 host-gateway 默认值"
  fi
else
  info "使用 shell 提供的 HOST_IP：$HOST_IP"
fi

if [ "$START_INFRA" = true ]; then
  info "=== 启动基础设施 ==="
  make infra-up
  info "等待 Kafka 就绪..."
  sleep 5
  make init-topics
  ok "基础设施已启动"
fi

# ============================================================
# 2. 构建
# ============================================================

if [ "$DO_BUILD" = true ]; then
  info "=== 构建后端 ==="
  make build
  ok "后端构建完成"
fi

# ============================================================
# 3. 后端服务
# ============================================================

if [ "$START_BACKEND" = true ]; then
  info "=== 启动后端服务 ==="

  # 顺序：先 data-writer、aggregator，再 ingest、simulator、dispatch-core，最后 gateway
  start_bg aggregator     "node core/services/aggregator/dist/server-entry.js"
  start_bg data-writer    "node core/services/data-writer/dist/server-entry.js"
  start_bg dispatch-core  "node core/services/dispatch-core/dist/server-entry.js"
  start_bg ingest         "node core/services/ingest/dist/server-entry.js"
  if [ "$START_SIMULATOR" = true ]; then
    start_bg simulator    "node core/services/simulator/dist/server-entry.js"
  fi

  info "等待后端服务健康检查..."
  sleep 3

  start_bg gateway        "node core/services/gateway/dist/server-entry.js"

  info "等待 gateway 就绪..."
  for i in $(seq 1 15); do
    if curl -sf http://localhost:9101/health >/dev/null 2>&1; then
      ok "gateway 已就绪"
      break
    fi
    sleep 1
  done
fi

# ============================================================
# 4. 前端
# ============================================================

if [ "$START_FRONTEND" = true ]; then
  info "=== 启动前端 ==="
  start_bg web "cd $ROOT/web && pnpm dev --host"

  info "等待前端就绪..."
  for i in $(seq 1 20); do
    if curl -sf http://localhost:5173/ >/dev/null 2>&1; then
      ok "前端已就绪"
      break
    fi
    sleep 1
  done
fi

# ============================================================
# 总结
# ============================================================

echo ""
ok "============================"
ok "  ApisCloud 已启动"
ok "============================"
echo ""
echo "  前端:         http://localhost:5173"
echo "  Gateway:      http://localhost:9101"
echo "  Gateway API:  http://localhost:9101/api/registry"
echo "  Gateway 健康: http://localhost:9101/health"
echo "  Prometheus:   http://localhost:9090"
echo "  Grafana:      http://localhost:13000 (admin/apiscloud)"
echo "  EMQX:         http://localhost:18083 (admin/apiscloud)"
echo ""
echo "  日志目录:     $LOG_DIR"
echo "  PID 目录:     $PID_DIR"
echo ""
echo "  查看日志:     tail -f logs/gateway.log"
echo "  停止服务:     ./scripts/dev-down.sh"
echo ""
