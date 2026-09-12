# 一、阶段 1.1 基础设施编排 · 经验总结

## 1. 完成了什么

阶段 1.1 结束时，项目具备以下能力：

| 类别 | 产出 |
|---|---|
| 基础设施编排 | `docker-compose.infra.yml` 一键启动 7 个服务 |
| 服务清单 | PostgreSQL 16、Redis 7、EMQX 5.8、Kafka 3.7（KRaft）、Prometheus 2.54、Loki 3.1、Grafana 11.2 |
| 数据库初始化 | `deploy/postgres/init.sql`，4 张业务表 + 1 个健康视图 |
| 配置持久化 | `deploy/redis/redis.conf`、`deploy/emqx/emqx.conf` |
| 监控配置 | `monitor/prometheus/prometheus.yml`、`monitor/loki/loki-config.yml` |
| Grafana 自动配置 | 数据源 provisioning + dashboards provisioning |
| 数据卷 | 7 个 named volume，`down` 不丢数据，`reset` 才删 |
| 健康检查 | 每个服务都有 healthcheck，`docker compose ps` 显示 healthy |
| Makefile | 新增 `infra-up` / `infra-down` / `infra-logs` / `infra-ps` / `infra-reset` |
| 环境变量 | `.env.example` 完整版，端口全部可配 |
| `.gitignore` | 排除数据卷目录和监控数据 |

## 2. 怎么完成的

按这个顺序推进：

1. **建目录**：`deploy/postgres`、`deploy/redis`、`deploy/emqx`、`monitor/prometheus`、`monitor/loki`、`monitor/grafana/provisioning/{datasources,dashboards}`、`monitor/grafana/dashboards`。
2. **写 `init.sql`**：4 张表 `vehicle_latest`、`vehicle_telemetry`、`alerts`、`dispatch_commands`，加索引和健康视图。
3. **写 Redis 配置**：`appendonly yes`，`maxmemory-policy allkeys-lru`。
4. **写 EMQX 配置**：监听 1883/8083/8883/18083，开发环境允许匿名连接。
5. **写 Prometheus 配置**：抓自身 + 预留 6 个应用服务 target。
6. **写 Loki 配置**：tsdb + filesystem，保留 168 小时。
7. **写 Grafana provisioning**：Prometheus 和 Loki 数据源自动挂载。
8. **写 `docker-compose.infra.yml`**：7 个服务，全部带 healthcheck，统一 bridge 网络 `apiscloud`，7 个 named volume。
9. **写 `.env.example`**：所有端口、连接串、凭据集中管理。
10. **写 Makefile**：5 个基础设施命令。
11. **启动**：`make infra-up`，逐个验证。

## 3. 遇到了什么问题

阶段 1.1 一共踩了 3 个坑：

| # | 问题 | 表现 |
|---|---|---|
| 1 | EMQX 1883 端口转发失败 | `make infra-up` 报 `ports are not available: exposing port TCP 0.0.0.0:1883 -> 127.0.0.1:0` |
| 2 | Grafana 3000 端口转发失败 | 改完 EMQX 后，`make infra-up` 又报同样的错，只是端口变成 `3000` |
| 3 | 端口占用与 Docker 端口转发 bug 混淆 | 无法立刻判断是系统占用还是 Docker 转发机制坏了 |

## 4. 怎么解决的

| # | 解决方案 |
|---|---|
| 1 | 把 `MQTT_PORT` 从 `1883` 改成 `11883`，`docker-compose.infra.yml` 里同步改成 `${MQTT_PORT:-11883}:1883` |
| 2 | 把 `GRAFANA_PORT` 从 `3000` 改成 `13000`，`docker-compose.infra.yml` 里同步改成 `${GRAFANA_PORT:-13000}:3000` |
| 3 | 换端口后所有服务 healthy，问题解决 |

**最终 `.env` 端口配置：**

```dotenv
MQTT_PORT=11883
MQTT_WS_PORT=8083
MQTT_SSL_PORT=8883
EMQX_DASHBOARD_PORT=18083

KAFKA_PORT=29092

PG_PORT=5432
REDIS_PORT=6379

PROMETHEUS_PORT=9090
GRAFANA_PORT=13000
LOKI_PORT=3100
```

## 5. 关键经验

1. **Docker 端口转发 500 错误，换端口是最快的解法**。`1883`、`3000` 是常用端口，机器上跑过其他服务就可能残留规则或占用。
2. **`.env` 和 `docker-compose.infra.yml` 的端口必须同步改**。`.env` 改 `MQTT_PORT=11883`，compose 里的默认值也要改成 `11883`，否则一旦 `.env` 读不到就会回退到旧默认值。
3. **`init.sql` 只在 PG 首次初始化执行**。改完 SQL 必须 `make infra-reset` 再 `make infra-up` 才能重建表。
4. **容器内和宿主机端口不一样**。容器内 Kafka 是 `kafka:9092`，宿主机是 `localhost:29092`；应用连宿主机用 `.env` 里的端口，容器间互连用服务名 + 内部端口。
5. **健康检查是编排的必要条件**。`depends_on: condition: service_healthy` 依赖 healthcheck，没有 healthcheck 的编排不稳定。
6. **数据卷让 `down` 可恢复**。开发阶段常用 `make infra-down` 停服务保数据，只有重建表或彻底清理才 `make infra-reset`。
7. **端口冲突优先改高位端口**。1xxxx 段（11883、13000、19090）通常不会和系统服务冲突。

## 6. 阶段 1.1 验收清单

- [x] `docker-compose.infra.yml` 存在且能解析
- [x] `make infra-up` 一键启动 7 个服务
- [x] `make infra-ps` 全部 healthy
- [x] PostgreSQL 里 4 张表存在
- [x] Redis `ping` 返回 `PONG`
- [x] EMQX Dashboard 可访问
- [x] Kafka `--list` 命令可执行
- [x] Prometheus UI 可访问
- [x] Loki `/ready` 返回 ready
- [x] Grafana UI 可访问
- [x] `make infra-down` 干净停止
- [x] `make infra-reset` 删数据卷
- [x] `.env.example` 完整
- [x] `deploy/postgres/init.sql` 建好 4 张表
- [x] `monitor/` 三个配置文件就位

---

# 二、阶段一 · 全部任务回顾

以下是原始计划书里的阶段一任务表，原样保留：

## 阶段一：基础设施与共享库

**阶段目标：** 搭建所有服务共用的底层设施，确保后续开发有统一依赖。

**实现思路：**

- 用 Docker Compose 编排 Kafka、PostgreSQL、EMQX、Redis、Prometheus、Grafana、Loki。
- 编写共享库，封装 MQTT、PG、Redis、日志、配置、健康检查。
- 编写消息总线抽象层，支持 MQTT/Kafka/Memory 适配器。
- 编写层配置，先声明单层结构，预留多层。
- 编写插件宿主，支持进程内扩展。
- 建立 registry 目录，准备预生成机制。
- 建立 docs 和 tests 目录，规范落地。
- 建立 GitHub Actions 配置，支持自动测试、自动构建。
- 编写安全性基础：认证、输入验证、密钥管理。

**具体任务：**

| 序号 | 任务 | 怎么完成 | 产出 |
|---|---|---|---|
| 1.1 | 编写基础设施编排 | Docker Compose 定义所有基础设施 | docker-compose.infra.yml |
| 1.2 | 编写数据库初始化 | SQL 建表：车辆表、遥测表、告警表 | init.sql |
| 1.3 | 编写共享库 | 逐个封装：mqtt/pg/redis/logger/config/health | core/libs/ |
| 1.4 | 编写消息总线抽象层 | 统一接口 + MQTT/Kafka/Memory 适配器 | shared/message-bus/ |
| 1.5 | 编写层配置 | layers.yml 声明单层，预留多层 | shared/layer-config/layers.yml |
| 1.6 | 编写插件宿主 | 加载、注册、生命周期、异常保护 | core/plugin-host/ |
| 1.7 | 编写可观测性服务 | Prometheus + Loki | core/services/observability/ |
| 1.8 | 编写 CI 配置 | GitHub Actions | .github/workflows/ci.yml |
| 1.9 | 建立 registry | 创建目录和占位文件 | core/registry/ |
| 1.10 | 建立 docs | 创建目录和 README | docs/ |
| 1.11 | 建立 tests | 创建目录和配置 | tests/ |
| 1.12 | 编写安全基础 | 认证、输入验证、密钥管理 | security.V1.md |
| 1.13 | 编写文档 | 每个功能一个文档 | infra.V1.md 等 |

**阶段验收：** 基础设施可一键启动，共享库可被引用，消息总线可切换，层配置可加载，插件宿主可加载插件，可观测性可用，CI 可运行。

**阶段文档：**

- `docs/architecture.V1.md`
- `docs/infra.V1.md`
- `docs/messageBus.V1.md`
- `docs/layerConfig.V1.md`
- `docs/pluginHost.V1.md`
- `docs/observability.V1.md`
- `docs/security.V1.md`
- `docs/cicd.V1.md`

---

## 任务进度对照

原始 13 项任务与当前实际进度的对应关系：

| 序号 | 任务 | 状态 | 说明 |
|---|---|---|---|
| 前置 | 工程初始化 | ✅ 已完成 | 我实际展开时新增的步骤，对应原任务的 1.9/1.10/1.11 的目录与骨架 |
| 1.1 | 编写基础设施编排 | ✅ 已完成 | `docker-compose.infra.yml` 一键启动 7 个服务，全部 healthy |
| 1.2 | 编写数据库初始化 | ✅ 已完成 | `deploy/postgres/init.sql` 建 4 张表 + 1 视图，PG 首次启动自动执行 |
| 1.3 | 编写共享库 | ⬜ 未开始 | 只有 `index.ts` 占位 |
| 1.4 | 编写消息总线抽象层 | ⬜ 未开始 | 只有 `index.ts` 占位 |
| 1.5 | 编写层配置 | 🟡 部分完成 | `layers.yml` 已建，loader / schema 未做 |
| 1.6 | 编写插件宿主 | ⬜ 未开始 | 只有 `index.ts` 占位 |
| 1.7 | 编写可观测性服务 | 🟡 部分完成 | 基础设施侧 Prometheus/Loki/Grafana 已就位，应用侧 observability 服务未做 |
| 1.8 | 编写 CI 配置 | ⬜ 未开始 | `.github/workflows/` 目录已建 |
| 1.9 | 建立 registry | 🟡 部分完成 | 目录、`.gitkeep`、`build-registry.js` 已建，扫描逻辑有骨架 |
| 1.10 | 建立 docs | ⬜ 未开始 | 目录已建，文档未写 |
| 1.11 | 建立 tests | ✅ 已完成 | `jest.config.js`、`setup.js`、`README.md`、冒烟测试已建 |
| 1.12 | 编写安全基础 | ⬜ 未开始 | 未做 |
| 1.13 | 编写文档 | ⬜ 未开始 | 未做 |

---

## 下一步

原始任务 **1.3 是：编写共享库**。

具体做：

- `core/libs/src/config`：`dotenv` + `zod` 读环境变量，启动时校验。
- `core/libs/src/logger`：`pino`，JSON 格式，字段含 `trace_id`、`span_id`、`service`、`plugin`、`layer`。
- `core/libs/src/health`：统一 `health()` 返回 `{ status, checks }`。
- `core/libs/src/pg`：`pg` 连接池，`query`、`transaction`、`health`。
- `core/libs/src/redis`：`ioredis`，`get/set/hset/hgetall/publish/subscribe`。
- `core/libs/src/mqtt`：`mqtt.js`，连接、发布、订阅、断线重连。
- `core/libs/src/metrics`：`prom-client`，暴露 `/metrics`。
- `core/libs/src/security`：JWT 验证、zod 输入校验、密钥读取。
- 每个模块一个单测，`make test-unit` 全绿。