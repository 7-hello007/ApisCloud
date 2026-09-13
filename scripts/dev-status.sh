#!/usr/bin/env bash
#
# ApisCloud 开发环境状态查看
#
set -uo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PID_DIR="$ROOT/.pids"

printf '%-20s %-10s %-8s\n' "服务" "状态" "PID"
printf '%-20s %-10s %-8s\n' "----" "----" "---"

check() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      printf '%-20s \033[1;32m%-10s\033[0m %-8s\n' "$name" "running" "$pid"
      return
    fi
  fi
  printf '%-20s \033[1;31m%-10s\033[0m %-8s\n' "$name" "stopped" "-"
}

check web
check gateway
check simulator
check ingest
check dispatch-core
check data-writer
check aggregator

echo ""
echo "基础设施:"
docker compose -f docker-compose.infra.yml ps --format 'table {{.Name}}\t{{.Status}}' 2>/dev/null || echo "  (未启动)"

echo ""
echo "健康检查:"
for port in 9101 9103 9104 9105 9107 9108; do
  if curl -sf "http://localhost:$port/health" >/dev/null 2>&1; then
    printf '  %-6s \033[1;32mok\033[0m\n' "$port"
  else
    printf '  %-6s \033[1;31mdown\033[0m\n' "$port"
  fi
done

echo ""
echo "前端: http://localhost:5173"
if curl -sf http://localhost:5173/ >/dev/null 2>&1; then
  printf '  \033[1;32mok\033[0m\n'
else
  printf '  \033[1;31mdown\033[0m\n'
fi
