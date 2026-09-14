#!/usr/bin/env bash
#
# ApisCloud 多规模验证
# 用不同规模的模拟器（500 / 1000 / 2000 辆车）验证系统表现。
#
# 用法：
#   ./scripts/verify-multi-scale.sh                默认 500 1000 2000
#   ./scripts/verify-multi-scale.sh 500 1000       自定义规模列表
#
# 前提：
#   1. 基础设施已启动
#   2. 除 simulator 外的所有后端服务已启动
#
set -uo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

KAFKA="apiscloud-kafka"
PG="apiscloud-postgres"
REDIS="apiscloud-redis"

SCALES=("$@")
if [ ${#SCALES[@]} -eq 0 ]; then
  SCALES=(500 1000 2000)
fi

info()  { printf '\033[1;34m[scale]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[scale]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[scale]\033[0m %s\n' "$*"; }
err()   { printf '\033[1;31m[scale]\033[0m %s\n' "$*" >&2; }

# ============================================================
# 准备：停掉现有 simulator
# ============================================================

PID_FILE="$ROOT/.pids/simulator.pid"
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    info "停止现有 simulator (pid=$OLD_PID)"
    kill -TERM "$OLD_PID" 2>/dev/null || true
    sleep 3
    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill -KILL "$OLD_PID" 2>/dev/null || true
    fi
  fi
  rm -f "$PID_FILE"
fi

# ============================================================
# 每个规模跑一轮
# ============================================================

RESULTS=()

for N in "${SCALES[@]}"; do
  echo ""
  info "=========================================="
  info "  规模：$N 辆车"
  info "=========================================="

  # 1. 清理数据
  info "清理旧数据 ..."
  docker exec -i "$PG" psql -U apiscloud -d apiscloud -c \
    "TRUNCATE vehicle_latest, vehicle_telemetry;" > /dev/null 2>&1 || true
  docker exec -i "$REDIS" redis-cli FLUSHALL > /dev/null 2>&1 || true

  # 2. 启动 simulator
  info "启动 simulator（$N 辆车）..."
  (
    cd "$ROOT"
    SIMULATOR_VEHICLE_COUNT="$N" \
    SIMULATOR_PUBLISH_INTERVAL_MS=1000 \
    nohup node core/services/simulator/dist/server-entry.js \
      > "logs/simulator-$N.log" 2>&1 &
    echo $! > "$PID_FILE"
  )

  sleep 3

  # 3. 等 30 秒让数据流稳定
  info "运行 30 秒 ..."
  for i in $(seq 30 -5 5); do
    printf "  倒计时 %2ds\r" "$i"
    sleep 5
  done
  printf "                    \r"

  # 4. 采集指标
  info "采集指标 ..."

  pg_telemetry=$(docker exec -i "$PG" psql -U apiscloud -d apiscloud -t -c \
    "SELECT count(*) FROM vehicle_telemetry;" 2>/dev/null | tr -d ' \n')
  pg_latest=$(docker exec -i "$PG" psql -U apiscloud -d apiscloud -t -c \
    "SELECT count(*) FROM vehicle_latest;" 2>/dev/null | tr -d ' \n')
  redis_active=$(docker exec -i "$REDIS" redis-cli SCARD vehicles:active 2>/dev/null || echo "0")
  redis_keys=$(docker exec -i "$REDIS" redis-cli DBSIZE 2>/dev/null || echo "0")

  # 5. 停 simulator
  info "停止 simulator ..."
  PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$PID" ]; then
    kill -TERM "$PID" 2>/dev/null || true
    sleep 2
    kill -KILL "$PID" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi

  # 6. 记录
  RESULTS+=("$N|$pg_telemetry|$pg_latest|$redis_active|$redis_keys")

  ok "规模 $N 完成"
  echo "  vehicle_telemetry: $pg_telemetry"
  echo "  vehicle_latest:    $pg_latest"
  echo "  vehicles:active:   $redis_active"
  echo "  redis keys:        $redis_keys"
done

# ============================================================
# 结果汇总
# ============================================================

echo ""
echo "=========================================="
echo "  多规模验证结果"
echo "=========================================="
echo ""
printf '%-10s %-20s %-18s %-18s %-12s\n' "规模" "telemetry 行数" "latest 行数" "vehicles:active" "redis keys"
printf '%-10s %-20s %-18s %-18s %-12s\n' "----" "----" "----" "----" "----"

for row in "${RESULTS[@]}"; do
  IFS='|' read -r n t l a k <<< "$row"
  printf '%-10s %-20s %-18s %-18s %-12s\n' "$n" "$t" "$l" "$a" "$k"
done

echo ""
ok "多规模验证完成"
echo ""
echo "  提示：PG 行数应该接近 规模×运行秒数（每秒 1 条/车）"
echo "        Redis vehicles:active 应该等于规模数"
