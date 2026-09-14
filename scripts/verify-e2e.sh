#!/usr/bin/env bash
#
# ApisCloud 端到端验证
# 用真实基础设施（Docker）+ 真实服务，跑一遍完整链路。
#
# 用法：
#   ./scripts/verify-e2e.sh
#
# 前提：
#   1. 基础设施已启动（make infra-up）
#   2. 后端服务已启动（./scripts/start.sh）
#   3. data-writer LAG 较小（建议先停 simulator 让积压消化）
#
set -uo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

KAFKA="apiscloud-kafka"
PG="apiscloud-postgres"
REDIS="apiscloud-redis"

info()  { printf '\033[1;34m[verify]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[verify]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[verify]\033[0m %s\n' "$*"; }
err()   { printf '\033[1;31m[verify]\033[0m %s\n' "$*" >&2; }

PASS=0
FAIL=0
FAILED_CHECKS=()

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    ok "✓ $name"
    PASS=$((PASS + 1))
  else
    err "✗ $name：$result"
    FAIL=$((FAIL + 1))
    FAILED_CHECKS+=("$name")
  fi
}

# ============================================================
# 1. 基础设施健康
# ============================================================
info "=== 1. 基础设施健康检查 ==="

for container in apiscloud-postgres apiscloud-redis apiscloud-kafka apiscloud-emqx; do
  status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")
  check "$container 健康" "$([ "$status" = "healthy" ] && echo ok || echo "状态：$status")"
done

# ============================================================
# 2. Kafka 主题
# ============================================================
info "=== 2. Kafka 主题检查 ==="

topics=$(docker exec -i "$KAFKA" /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list 2>/dev/null || echo "")

for t in telemetry.raw telemetry.aggregated events.commands events.alerts; do
  if echo "$topics" | grep -q "^${t}$"; then
    check "主题 $t 存在" ok
  else
    check "主题 $t 存在" "缺失"
  fi
done

# ============================================================
# 3. 后端服务健康
# ============================================================
info "=== 3. 后端服务健康检查 ==="

declare -A PORTS=(
  [gateway]=9101
  [ingest]=9103
  [data-writer]=9104
  [dispatch-core]=9105
  [simulator]=9107
  [aggregator]=9108
)

for svc in "${!PORTS[@]}"; do
  port="${PORTS[$svc]}"
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/health" 2>/dev/null || echo "000")
  if [ "$http_code" = "200" ]; then
    check "$svc (:$port) /health" ok
  elif [ "$svc" = "simulator" ]; then
    warn "~ $svc (:$port) /health 未运行（跳过，simulator 可选）"
  else
    check "$svc (:$port) /health" "HTTP $http_code"
  fi
done

# ============================================================
# 3.5. data-writer 消费积压检查
# ============================================================
info "=== 3.5. data-writer 消费积压检查 ==="

lag=$(docker exec -i "$KAFKA" /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group apiscloud-data-writer--telemetry-raw 2>/dev/null \
  | awk 'NR>1 {sum+=$5} END {print sum+0}')

if [ "$lag" -gt 10000 ]; then
  warn "data-writer 积压 $lag 条，遥测验证可能受影响"
  warn "建议：停 simulator + 重置消费位点（见 docs/delivery.V1.md）"
fi
echo "  当前 LAG: $lag"

# ============================================================
# 4. 遥测端到端
# ============================================================
info "=== 4. 遥测端到端（Kafka → ingest → 总线 → PG/Redis） ==="

# 清空测试数据
docker exec -i "$PG" psql -U apiscloud -d apiscloud -c \
  "DELETE FROM vehicle_latest WHERE vehicle_id LIKE 'v-verify-%';" > /dev/null 2>&1 || true

TS=$(($(date +%s) * 1000))
VEHICLE="v-verify-$(date +%s)"
LAT=31.2304
LNG=121.4737

info "发送测试遥测：$VEHICLE"
docker exec -i "$KAFKA" /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 --topic telemetry.raw > /dev/null << MSG
{"id":"v-$TS","topic":"telemetry.raw","source":"verify-script","timestamp":$TS,"trace_id":"trace-verify","span_id":"span-verify","version":"1.0","payload":{"vehicle_id":"$VEHICLE","ts":$TS,"lat":$LAT,"lng":$LNG,"speed":30,"battery":80,"heading":90,"status":"running"}}
MSG

# 轮询等待（最多 60 秒）
info "等待 data-writer 消费 ..."
pg_count=0
elapsed=0
for i in $(seq 1 60); do
  pg_count=$(docker exec -i "$PG" psql -U apiscloud -d apiscloud -t -c \
    "SELECT count(*) FROM vehicle_latest WHERE vehicle_id = '$VEHICLE';" 2>/dev/null | tr -d ' \n')
  if [ "$pg_count" = "1" ]; then
    elapsed=$i
    break
  fi
  sleep 1
done
check "遥测落 PG vehicle_latest" "$([ "$pg_count" = "1" ] && echo ok || echo "行数：$pg_count（等了 ${elapsed}s）")"

# 检查 Redis
redis_latest=$(docker exec -i "$REDIS" redis-cli GET "vehicle:$VEHICLE:latest" 2>/dev/null || echo "")
check "遥测落 Redis 热路径" "$([ -n "$redis_latest" ] && echo ok || echo "key 为空")"

# ============================================================
# 5. 告警端到端
# ============================================================
info "=== 5. 告警端到端（geofence → 总线 → PG/Redis） ==="

ALERT_VEHICLE="v-verify-alert-$(date +%s)"
TS=$(($(date +%s) * 1000))

# 第一次：围栏内
docker exec -i "$KAFKA" /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 --topic telemetry.raw > /dev/null << MSG
{"id":"a1-$TS","topic":"telemetry.raw","source":"verify-script","timestamp":$TS,"trace_id":"t-a1","span_id":"s-a1","version":"1.0","payload":{"vehicle_id":"$ALERT_VEHICLE","ts":$TS,"lat":31.2304,"lng":121.4737,"speed":30,"battery":80,"heading":90,"status":"running"}}
MSG

sleep 2

# 第二次：围栏外
docker exec -i "$KAFKA" /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 --topic telemetry.raw > /dev/null << MSG
{"id":"a2-$TS","topic":"telemetry.raw","source":"verify-script","timestamp":$TS,"trace_id":"t-a2","span_id":"s-a2","version":"1.0","payload":{"vehicle_id":"$ALERT_VEHICLE","ts":$TS,"lat":31.9,"lng":121.4737,"speed":30,"battery":80,"heading":90,"status":"running"}}
MSG

# 轮询等待（最多 30 秒）
alert_count=0
for i in $(seq 1 30); do
  alert_count=$(docker exec -i "$PG" psql -U apiscloud -d apiscloud -t -c \
    "SELECT count(*) FROM alerts WHERE vehicle_id = '$ALERT_VEHICLE';" 2>/dev/null | tr -d ' \n')
  if [ "$alert_count" -ge 1 ]; then
    break
  fi
  sleep 1
done
check "geofence 告警落 PG alerts" "$([ "$alert_count" -ge 1 ] && echo ok || echo "行数：$alert_count")"

# ============================================================
# 6. Prometheus 抓取
# ============================================================
info "=== 6. Prometheus 抓取检查 ==="

up_count=0
for i in $(seq 1 30); do
  prom_result=$(curl -s --data-urlencode 'query=up{job="apiscloud-services"}' \
    'http://localhost:9090/api/v1/query' 2>/dev/null || echo "{}")
  up_count=$(echo "$prom_result" | jq -r '.data.result | map(select(.value[1] == "1")) | length' 2>/dev/null || echo "0")
  if [ "$up_count" -ge 5 ]; then
    break
  fi
  sleep 1
done
check "Prometheus 至少 5 个 target UP" "$([ "$up_count" -ge 5 ] && echo ok || echo "UP：$up_count")"

# ============================================================
# 7. Grafana 仪表板
# ============================================================
info "=== 7. Grafana 仪表板检查 ==="

dash=$(curl -s -u admin:apiscloud 'http://localhost:13000/api/search?type=dash-db' 2>/dev/null || echo "[]")
dash_count=$(echo "$dash" | jq 'length' 2>/dev/null || echo "0")
check "Grafana 至少 1 个仪表板" "$([ "$dash_count" -ge 1 ] && echo ok || echo "数量：$dash_count")"

# ============================================================
# 8. 结果汇总
# ============================================================
echo ""
echo "=========================================="
echo "  验证结果"
echo "=========================================="
echo ""
echo "  通过：$PASS"
echo "  失败：$FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  失败的检查项："
  for item in "${FAILED_CHECKS[@]}"; do
    echo "    - $item"
  done
  echo ""
  exit 1
fi

ok "全部验证通过 ✓"
