# 基础设施编排 V1

## 一、功能目标

用 Docker Compose 编排所有基础设施，做到一键启动、全部健康、数据持久化。

涵盖：PostgreSQL、Redis、EMQX、Kafka、Prometheus、Loki、Grafana。

## 二、基础实现

### 2.1 文件位置

- `docker-compose.infra.yml` — 编排定义
- `deploy/postgres/init.sql` — 数据库初始化
- `deploy/redis/redis.conf` — Redis 配置
- `deploy/emqx/emqx.conf` — EMQX 配置
- `monitor/prometheus/prometheus.yml` — Prometheus 抓取配置
- `monitor/loki/loki-config.yml` — Loki 配置
- `monitor/grafana/provisioning/` — Grafana 数据源和面板配置

### 2.2 服务清单

| 服务 | 镜像 | 用途 | 宿主机端口 |
|---|---|---|---|
| PostgreSQL | postgres:16-alpine | 持久化 | 5432 |
| Redis | redis:7-alpine | 热路径 | 6379 |
| EMQX | emqx/emqx:5.8.0 | MQTT Broker | 11883（MQTT）、8083（WS）、8883（SSL）、18083（Dashboard） |
| Kafka | apache/kafka:3.7.0 | 消息总线（KRaft 单节点） | 29092 |
| Prometheus | prom/prometheus:v2.54.0 | 指标采集 | 9090 |
| Loki | grafana/loki:3.1.0 | 日志聚合 | 3100 |
| Grafana | grafana/grafana:11.2.0 | 可视化 | 13000 |

### 2.3 数据库表

`init.sql` 建 4 张表 + 1 视图：

| 表 | 用途 |
|---|---|
| vehicle_latest | 车辆最新状态（O(1) 读） |
| vehicle_telemetry | 车辆遥测（时序） |
| alerts | 告警 |
| dispatch_commands | 调度指令审计 |
| health_check | 健康检查视图 |

### 2.4 数据卷

7 个 named volume：`pg_data`、`redis_data`、`emqx_data`、`kafka_data`、`prometheus_data`、`grafana_data`、`loki_data`。

`make infra-down` 保留数据，`make infra-reset` 删除数据。

### 2.5 Makefile 命令

| 命令 | 作用 |
|---|---|
| `make infra-up` | 启动所有服务 |
| `make infra-down` | 停止（保留数据） |
| `make infra-logs` | 查看日志 |
| `make infra-ps` | 查看状态 |
| `make infra-reset` | 重置（删数据） |

## 三、V1 修改

### 变更一：端口调整

**为什么改：** 宿主机上 `1883` 和 `3000` 端口转发失败（Docker 报 `ports are not available`），常见原因是端口被其他进程占用或 Docker 端口转发机制异常。

**怎么改：**

- EMQX MQTT 端口：`1883` → `11883`
- Grafana 端口：`3000` → `13000`

**影响：** `.env`、`docker-compose.infra.yml`、应用侧连接串同步更新。

### 变更二：Kafka 用 KRaft 单节点

**为什么改：** 开发环境不需要 ZooKeeper，KRaft 模式更轻量。

**怎么改：** `KAFKA_PROCESS_ROLES=broker,controller`，`KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka:9093`。

## 四、后续版本

- 阶段六：补充 Promtail（Loki 日志采集）
- 阶段六：补充多环境配置（dev/staging/prod）