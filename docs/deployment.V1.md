# 部署指南 V1

## 一、功能目标

描述 ApisCloud 的三种部署方式：本地开发、Docker Compose、云端 K8s。让新成员能在 30 分钟内跑起系统。

## 二、部署方式概览

| 方式 | 用途 | 依赖 | 启动时间 |
|---|---|---|---|
| 本地开发 | 开发、调试 | Node 20+、pnpm 9+、Docker | ~2 分钟 |
| Docker Compose | 演示、集成测试 | Docker、Docker Compose | ~5 分钟 |
| 云端 K8s | 生产（预留） | K8s 集群、镜像仓库 | — |

## 三、本地开发部署

### 3.1 前置要求

| 项 | 版本 | 检查命令 |
|---|---|---|
| Node.js | ≥ 20 | `node -v` |
| pnpm | ≥ 9 | `pnpm -v` |
| Docker | ≥ 20 | `docker -v` |
| Docker Compose | ≥ 2 | `docker compose version` |

### 3.2 首次安装

```bash
# 1. 克隆仓库
git clone <repo>
cd ApisCloud

# 2. 安装依赖
pnpm install

# 3. 复制环境变量模板
cp .env.example .env
# 按需修改 .env（HOST_IP 会自动检测，一般不用改）
```

### 3.3 一键启动

```bash
# 启动全部：基础设施 + 后端服务 + 前端
./scripts/start.sh

# 或指定 profile
./scripts/start.sh PROFILE=full
```

**`start.sh` 做了什么：**

1. 启动基础设施（PG / Redis / EMQX / Kafka / Prometheus / Loki / Grafana）
2. 初始化 Kafka 主题
3. 构建所有包
4. 启动 6 个后端服务：aggregator、data-writer、dispatch-core、ingest、simulator、gateway
5. 启动前端 Vite dev server

**等 30 秒，访问：**

- 前端：http://localhost:5173
- Gateway：http://localhost:9101/health
- Prometheus：http://localhost:9090
- Grafana：http://localhost:13000（admin / apiscloud）
- EMQX：http://localhost:18083（admin / apiscloud）

### 3.4 停止

```bash
# 停止后端和前端，保留基础设施
make stop

# 停止全部（含基础设施，保留数据）
./scripts/dev-down.sh

# 停止全部并删除数据
./scripts/dev-down.sh --reset
```

### 3.5 查看状态

```bash
make status
# 或
./scripts/dev-status.sh
```

**预期输出：**

```
服务                 状态       PID
----                 ----       ---
web                  running    12345
gateway              running    12344
...

基础设施:
NAME                     STATUS
apiscloud-postgres       Up 5 minutes (healthy)
...

健康检查:
  9101   ok
  9103   ok
  ...

前端: http://localhost:5173
  ok
```

### 3.6 查看日志

```bash
# 全部日志
tail -f logs/*.log

# 单个服务
tail -f logs/gateway.log
tail -f logs/data-writer.log
```

### 3.7 常见问题

| 现象 | 原因 | 修复 |
|---|---|---|
| `EADDRINUSE: 9101` | 旧进程占用端口 | `make stop` 或 `lsof -i:9101` 后 kill |
| `ECONNREFUSED 29092` | Kafka 未启动 | `make infra-up` |
| `UNKNOWN_TOPIC_OR_PARTITION` | 主题未创建 | `make init-topics` |
| 前端 `/api/registry` 502 | gateway 未启动 | `make start` |
| Grafana 无仪表板 | `datasources.yml` 缺 uid | 见"部署踩坑" |
| 电量/速度显示 `—` | PG NUMERIC 返回字符串 | 已在阶段五修复（`::float8`） |

---

## 四、Docker Compose 部署

### 4.1 完整 compose 文件

当前 `docker-compose.infra.yml` **只编排基础设施**。**后端服务独立进程启动**（通过 `dev-up.sh`）。

**完整 Docker 部署需要额外的 `docker-compose.app.yml`**（阶段六预留，未实现）：

```yaml
# 预留示例
services:
  aggregator:
    build: ./core/services/aggregator
    ports: ['9108:9108']
    env_file: .env
    depends_on:
      kafka:
        condition: service_healthy
  # ... 其他服务
```

**当前推荐用本地开发部署（`./scripts/start.sh`）。**

### 4.2 只跑基础设施

```bash
make infra-up
make init-topics
```

**在宿主机上跑后端：**

```bash
./scripts/dev-up.sh --no-infra --no-build
```

### 4.3 远程部署到另一台机器

```bash
# 1. 在开发机打包
tar -czf apiscloud.tar.gz \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='coverage' \
  .

# 2. 传到目标机
scp apiscloud.tar.gz user@server:/opt/

# 3. 在目标机解压启动
ssh user@server
cd /opt && tar -xzf apiscloud.tar.gz -C apiscloud
cd apiscloud
pnpm install
cp .env.example .env
# 编辑 .env，配置 HOST_IP 为宿主机 IP
./scripts/start.sh
```

**注意：** 目标机需要 Docker。`HOST_IP` 要指向目标机自己的 LAN IP。

---

## 五、云端 K8s 部署（预留）

**阶段六不做，只描述思路。**

### 5.1 镜像构建

每个服务需要 Dockerfile：

```dockerfile
# 示例：core/services/gateway/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY core/libs ./core/libs
COPY core/plugin-host ./core/plugin-host
COPY core/services/gateway ./core/services/gateway
COPY shared ./shared
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @apiscloud/gateway build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/core/services/gateway/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/server-entry.js"]
```

### 5.2 K8s 部署清单

```
deploy/k8s/
├── namespace.yaml
├── configmap.yaml           # 非敏感配置
├── secrets.yaml             # JWT_SECRET、DISPATCH_SIGN_SECRET
├── kafka.yaml               # 或用外部 Kafka
├── postgres.yaml            # 或用托管 PG
├── redis.yaml
├── emqx.yaml
├── aggregator.yaml
├── data-writer.yaml
├── dispatch-core.yaml
├── ingest.yaml
├── gateway.yaml
├── web.yaml                 # Nginx + 前端静态文件
└── ingress.yaml
```

### 5.3 服务间通信

K8s 里服务用 Service 名互相访问：

| 环境 | Kafka 地址 | PG 地址 |
|---|---|---|
| 本地 | `localhost:29092` | `localhost:5432` |
| Docker Compose | `kafka:9092` | `postgres:5432` |
| K8s | `kafka.default.svc.cluster.local:9092` | `postgres.default.svc:5432` |

**通过 ConfigMap 注入：**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: apiscloud-config
data:
  KAFKA_BROKERS: "kafka.default.svc:9092"
  PG_HOST: "postgres.default.svc"
  REDIS_URL: "redis://redis.default.svc:6379"
  MQTT_URL: "mqtt://emqx.default.svc:1883"
  MESSAGE_BUS: "kafka"
```

### 5.4 多集群（预留）

`layers.yml` 支持 `cluster` 字段（阶段五已预留）：

```yaml
layers:
  - name: access-east
    cluster: east
    services: [ingest, data-writer]
  - name: access-west
    cluster: west
    services: [ingest, data-writer]
```

**阶段六不做多集群。**

---

## 六、部署踩坑（阶段一~六真实遇到的）

| 问题 | 原因 | 解决 |
|---|---|---|
| EMQX 1883 端口被占 | 系统其他服务占用 | 改用 11883（`.env` 的 `MQTT_PORT`） |
| Grafana 3000 端口被占 | 系统其他服务占用 | 改用 13000 |
| Docker Desktop for Linux 的 `host.docker.internal` 指向 VM | Docker Desktop 网络模型 | `extra_hosts: ${HOST_IP:-host-gateway}` |
| Kafka 主题不存在 | `KAFKA_AUTO_CREATE_TOPICS_ENABLE` 在 KRaft 下不生效 | `make init-topics` |
| Kafka 消费组无限 rebalance | 同一 groupId 订阅多个主题 | 复合 groupId：`<base>--<topic>` |
| Prometheus 2.54 不支持 `--config.expand-env` | 版本差异 | 端口写死，HOST_IP 用 `${HOST_IP:-host-gateway}` |
| Loki 配置 `structured_metadata.fields` 报错 | 不是合法配置项 | 删掉，用 `limits_config.allow_structured_metadata: true` |
| Grafana dashboard NO DATA | `datasources.yml` 缺 `uid` | 加 `uid: prometheus` 和 `uid: loki` |
| 前端电量显示 `—` | PG NUMERIC 返回字符串 | SQL 加 `::float8` |
| 时间戳超长被 zod 拒 | `date +%s%3N` 输出 19 位 | 用 `$(date +%s) * 1000` |

---

## 七、环境变量清单

### 7.1 运行环境

| 变量 | 默认 | 说明 |
|---|---|---|
| `NODE_ENV` | `development` | development / test / production |
| `LOG_LEVEL` | `info` | fatal / error / warn / info / debug / trace / silent |
| `TZ` | `Asia/Shanghai` | 时区 |

### 7.2 消息总线

| 变量 | 默认 | 说明 |
|---|---|---|
| `MESSAGE_BUS` | `memory` | memory / mqtt / kafka |
| `KAFKA_BROKERS` | `localhost:29092` | Kafka 地址 |
| `KAFKA_CLIENT_ID` | `apiscloud` | Kafka 客户端 ID |
| `MQTT_URL` | `mqtt://localhost:11883` | MQTT 地址 |

### 7.3 存储

| 变量 | 默认 | 说明 |
|---|---|---|
| `PG_HOST` / `PG_PORT` / `PG_USER` / `PG_PASSWORD` / `PG_DATABASE` | `localhost` / `5432` / `apiscloud` / `apiscloud` / `apiscloud` | PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379` | Redis |

### 7.4 服务端口

| 服务 | 端口 | 环境变量 |
|---|---|---|
| gateway | 9101 | `GATEWAY_PORT` |
| plugin-host | 9102 | `PLUGIN_HOST_PORT`（库，不监听） |
| ingest | 9103 | `INGEST_PORT` |
| data-writer | 9104 | `DATA_WRITER_PORT` |
| dispatch-core | 9105 | `DISPATCH_CORE_PORT` |
| observability | 9106 | `OBSERVABILITY_PORT`（库） |
| simulator | 9107 | `SIMULATOR_PORT` |
| aggregator | 9108 | `AGGREGATOR_PORT` |

### 7.5 安全

| 变量 | 默认 | 说明 |
|---|---|---|
| `JWT_SECRET` | `change-me-in-production` | **生产必须替换** |
| `DISPATCH_SIGN_SECRET` | `change-me-command-sign-secret` | **生产必须替换** |
| `GATEWAY_AUTH_ENABLED` | `false` | 是否开启 JWT 认证 |
| `GATEWAY_RATE_LIMIT_ENABLED` | `true` | 是否开启限流 |
| `INGEST_VERIFY_SIGNATURE` | `false` | 是否校验指令签名 |

### 7.6 调度配置

| 变量 | 默认 | 说明 |
|---|---|---|
| `DISPATCH_ALGORITHM` | `nearest` | 默认算法 |
| `DISPATCH_FALLBACK_ALGORITHM` | `nearest` | 回退算法 |
| `DISPATCH_ALGORITHM_TIMEOUT_MS` | `500` | 算法超时 |
| `DISPATCH_WEIGHT_DISTANCE` | `1.0` | 目标函数权重 |
| `DISPATCH_REGION_RADIUS_KM` | `30` | 运营区域半径 |

### 7.7 聚合器

| 变量 | 默认 | 说明 |
|---|---|---|
| `AGGREGATOR_WINDOW_MS` | `5000` | 聚合窗口 |
| `AGGREGATOR_LOW_BATTERY_THRESHOLD` | `20` | 低电量阈值 |

### 7.8 模拟器

| 变量 | 默认 | 说明 |
|---|---|---|
| `SIMULATOR_VEHICLE_COUNT` | `500` | 车辆数 |
| `SIMULATOR_PUBLISH_INTERVAL_MS` | `1000` | 上报间隔 |
| `SIMULATOR_RADIUS_KM` | `30` | 运营半径 |

## 八、V1 修改

无（首版）。

## 九、后续版本

### 阶段六之后

- `docker-compose.app.yml`：完整容器化后端服务
- `deploy/k8s/`：K8s 部署清单
- `deploy/helm/`：Helm chart
- 多环境配置：dev / staging / prod
- 灰度发布、蓝绿发布
- 数据库迁移脚本

### 长期

- 多集群部署
- 跨区域容灾
- 自动扩缩容（HPA）