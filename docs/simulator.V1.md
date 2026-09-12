# 模拟器 V1

## 一、功能目标

模拟一个外部自动驾驶系统，产生 500 辆模拟车辆的状态数据，通过 MQTT 上报到 EMQX，供 ingest 订阅、转发到消息总线、再由 data-writer 落库。

模拟器不是简单产生假数据，而是模拟一个真实的外部系统，包括：

- 车辆状态：位置、速度、电量、航向按真实逻辑变化
- 状态迁移：空闲、行驶、充电、维护、离线
- 任务响应：车辆动态产生目标点，到达后回到空闲
- 协议行为：按标准 JSON 格式通过 MQTT 上报
- 可调规模：车辆数、上报频率、运营区域可从环境变量配置

关键定位：模拟器是外部系统的替身，未来真实自动驾驶系统接入时，模拟器退场，ingest 侧不用改。

核心规则：

- 只通过 MQTT 上报，不直接写消息总线
- 不直接写库
- 独立启动，不走 plugin-host
- 暴露 /metrics 和 /health
- 数据流方向：simulator → EMQX → ingest

## 二、基础实现

### 2.1 文件位置

core/services/simulator/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server-entry.ts
    ├── types.ts
    ├── config.ts
    ├── gps-generator.ts
    ├── state-machine.ts
    ├── vehicle.ts
    ├── fleet.ts
    ├── mqtt-publisher.ts
    └── service.ts

### 2.2 依赖

@apiscloud/libs：配置、日志、健康、MQTT 封装、指标
@apiscloud/observability：可观测性服务，暴露 /metrics 和 /health

不依赖 @apiscloud/message-bus，因为模拟器不碰内部总线。

### 2.3 数据模型

VehicleState 字段：

vehicle_id：车辆唯一标识，格式 v-NNNNNN
ts：毫秒时间戳
lat：纬度
lng：经度
speed：速度（km/h）
battery：电量（0-100）
heading：航向（0-360）
status：状态，取值 idle、running、charging、maintenance、offline

字段与 deploy/postgres/init.sql 的 vehicle_telemetry 表对齐，方便 data-writer 直接映射。

### 2.4 配置项

从环境变量读取，全部有默认值：

SIMULATOR_VEHICLE_COUNT：车辆数，默认 500
SIMULATOR_PUBLISH_INTERVAL_MS：上报间隔毫秒，默认 1000
SIMULATOR_CENTER_LAT：运营中心纬度，默认 31.2304（上海）
SIMULATOR_CENTER_LNG：运营中心经度，默认 121.4737（上海）
SIMULATOR_RADIUS_KM：运营半径 km，默认 30
SIMULATOR_MIN_SPEED：最小速度 km/h，默认 20
SIMULATOR_MAX_SPEED：最大速度 km/h，默认 60
SIMULATOR_MQTT_TOPIC：MQTT 上报主题，默认 telemetry/raw
SIMULATOR_PORT：HTTP 端口，默认 9107

非法值启动即失败，避免静默错误。

### 2.5 状态机

状态迁移规则：

idle：电量低于 20% 转 charging；有目标转 running；否则保持 idle
running：电量低于 5% 转 charging；到达目标转 idle；否则保持 running
charging：电量达到 95% 转 idle；否则保持 charging
maintenance：保持
offline：保持

电量计算：

running 状态每秒耗电 0.1%
charging 状态每秒充入 2%
其他状态电量不变
电量限制在 0-100 之间

状态机和电量计算都是纯函数，输入输出确定，方便单元测试。

### 2.6 GPS 计算

randomPointInRadius：在给定圆心和半径内随机生成点，用 sqrt 保证面积均匀
distanceKm：Haversine 公式计算球面距离
moveTowards：从起点向终点移动指定距离，返回新位置
bearing：计算两点间航向角，正北为 0，顺时针 0-360

### 2.7 单车模型

Vehicle 类封装：
- 位置、速度、电量、航向、状态
- 目标点
- tick 方法推进一个时间片

每次 tick：
1. 计算是否到达目标
2. 根据状态机计算下一状态
3. 如果 running，向目标移动，更新位置、速度、航向
4. 如果 idle，有 5% 概率产生新目标
5. 更新电量
6. 返回状态快照

到达目标判定距离 50 米。

### 2.8 车队管理

Fleet 类管理 N 辆车，批量 tick 返回状态列表。

车辆 ID 格式 v-000001 到 v-000500，6 位补零。

### 2.9 MQTT 上报

复用 @apiscloud/libs 的 MQTT 封装。

连接 EMQX，发布到 telemetry/raw，QoS 1。

payload 是 VehicleState 的 JSON 字符串。

### 2.10 服务组合

SimulatorService 组合：
- 配置：loadSimulatorConfig
- 车队：Fleet
- MQTT 发布器：MqttPublisher
- 可观测性：ObservabilityService

启动流程：
1. 加载配置
2. 创建可观测性服务
3. 连接 MQTT
4. 启动 HTTP 服务器
5. 注册健康检查：mqtt、fleet
6. 启动定时器，按 publishIntervalMs 周期 tick
7. 每轮 tick 后并行发布所有车辆状态
8. 累加 dataflow_messages_total 指标

停止流程：
1. 清理定时器
2. 关闭 MQTT 连接
3. 停止 HTTP 服务器

### 2.11 健康检查

/health 返回三个检查项：

self：可观测性服务自身
mqtt：MQTT 连接状态
fleet：车辆数

### 2.12 指标

复用可观测性服务的指标集：

apiscloud_dataflow_messages_total，标签 topic=telemetry/raw、direction=out
apiscloud_http_requests_total
apiscloud_http_request_duration_seconds
以及 Prometheus 默认指标

### 2.13 独立启动

命令：
node dist/server-entry.js

环境变量：
SIMULATOR_PORT 覆盖端口，默认 9107

支持 SIGTERM、SIGINT 优雅关闭。

### 2.14 监控集成

monitor/prometheus/prometheus.yml 已加 simulator target：host.docker.internal:9107。

Grafana 可通过 Prometheus 数据源看到 simulator 指标。

## 三、V1 修改

无（首版）。

## 四、后续版本

阶段五：支持动态调整车辆数和发布频率，用于压测对比
阶段五：支持模拟网络异常（断连、延迟、重传）
阶段五：支持按区域分组上报
阶段六：支持从配置文件加载初始车队分布
阶段六：支持可选的 gRPC 或 HTTP 上报通道