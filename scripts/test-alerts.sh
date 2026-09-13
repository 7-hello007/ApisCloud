#!/usr/bin/env bash
set -e

KAFKA_CONTAINER="apiscloud-kafka"
TOPIC="telemetry.raw"

# 生成 13 位毫秒时间戳（兼容所有 date 实现）
now_ms() {
  echo "$(($(date +%s) * 1000))"
}

send() {
  local id="$1"
  local vehicle_id="$2"
  local lat="$3"
  local lng="$4"
  local speed="$5"
  local battery="$6"
  local status="$7"
  local ts
  ts=$(now_ms)

  docker exec -i "$KAFKA_CONTAINER" /opt/kafka/bin/kafka-console-producer.sh \
    --bootstrap-server localhost:9092 \
    --topic "$TOPIC" > /dev/null << MSG
{"id":"$id","topic":"$TOPIC","source":"manual-test","timestamp":$ts,"trace_id":"trace-$id","span_id":"span-$id","version":"1.0","payload":{"vehicle_id":"$vehicle_id","ts":$ts,"lat":$lat,"lng":$lng,"speed":$speed,"battery":$battery,"heading":90,"status":"$status"}}
MSG
  echo "  → 发送 $id: $vehicle_id status=$status speed=$speed battery=$battery ts=$ts"
}

echo "=========================================="
echo " 告警测试"
echo "=========================================="
echo ""
echo "【场景 1】geofence_exit：车辆从内到外"
echo "  围栏：上海中心 31.2304,121.4737，半径 30km"
echo "  先发围栏内（31.2304,121.4737），再发围栏外（31.9,121.4737，约 74km）"
echo ""

# 第一次：在围栏内（只记录状态，不告警）
send "geo-1" "v-test-geo" "31.2304" "121.4737" "30" "80" "running"
sleep 2

# 第二次：出围栏 → 触发 geofence_exit
send "geo-2" "v-test-geo" "31.9" "121.4737" "30" "80" "running"
echo ""

echo "【场景 2】speed_anomaly：速度超 120 km/h"
send "speed-1" "v-test-speed" "31.2304" "121.4737" "150" "80" "running"
echo ""

echo "【场景 3】battery_drop：10 秒内电量从 90 掉到 60"
send "bat-1" "v-test-bat" "31.2304" "121.4737" "30" "90" "running"
echo "  等待 10 秒..."
sleep 10
send "bat-2" "v-test-bat" "31.2304" "121.4737" "30" "60" "running"
echo ""

echo "=========================================="
echo " 等待 5 秒让告警流经总线 → data-writer → PG"
echo "=========================================="
sleep 5

echo ""
echo "【PG alerts 表】最近 10 条："
docker exec -i apiscloud-postgres psql -U apiscloud -d apiscloud -t -c "
  SELECT vehicle_id, alert_type, level, message
  FROM alerts
  WHERE vehicle_id LIKE 'v-test-%'
  ORDER BY created_at DESC
  LIMIT 10;
" || echo "  （查询失败）"

echo ""
echo "【Redis alerts:recent】最近 5 条："
docker exec -i apiscloud-redis redis-cli LRANGE alerts:recent 0 4
