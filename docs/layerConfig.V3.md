# 层配置 V3

## 一、功能目标

把「服务」和「层」解耦。服务是逻辑单元，层是部署单元；加层只改配置，服务代码零改动。

核心思想：

- 服务：逻辑功能，如 dispatch-core、ingest、data-writer。
- 层：部署位置，如接入层、处理层、决策层。
- 服务实例：服务在某一层的具体运行实例。
- 层配置：声明某层启用哪些服务。

**同一服务可以在任意层部署，代码不变。**

## 二、基础实现

### 2.1 文件位置

```
shared/layer-config/
├── layers.yml     — 层配置
├── schema.ts      — zod 校验
├── loader.ts      — 加载和查询
├── index.ts       — 统一出口
├── package.json
└── tsconfig.json
```

### 2.2 当前配置

当前单层结构，11 个核心服务集中运行：

```yaml
version: "1"

layers:
  - name: single
    description: 单层部署，所有服务集中运行（当前阶段）
    services:
      - infra
      - gateway
      - plugin-host
      - libs
      - ingest
      - data-writer
      - simulator
      - dispatch-core
      - aggregator
      - observability
      - registry
```

### 2.3 Schema 校验

| 校验项 | 规则 |
|---|---|
| 版本号 | 非空字符串，默认 `"1"` |
| 层名 | `^[a-z][a-z0-9-]*$`，小写字母、数字、连字符，以字母开头 |
| 层名唯一 | loader 手动校验（zod 不支持数组元素唯一性） |
| 服务名 | `KNOWN_SERVICES` 白名单 |
| 服务列表 | 至少一个 |
| 层列表 | 至少一层 |

已知服务白名单：

```
infra
gateway
plugin-host
libs
ingest
data-writer
simulator
dispatch-core
aggregator
observability
registry
```

新增核心服务时，需要在 `KNOWN_SERVICES` 里加一条。

### 2.4 查询函数

| 函数 | 作用 |
|---|---|
| `loadLayers({ filePath? })` | 读文件、解析 YAML、zod 校验、层名唯一性校验 |
| `getLayer(config, name)` | 按名取层，不存在抛错 |
| `getServices(config, layerName)` | 取某层服务清单，返回副本避免外部修改 |
| `getLayerNames(config)` | 取所有层名 |
| `isServiceEnabled(config, layerName, service)` | 判断某服务是否在某层启用 |

### 2.5 加层示例

从单层加到三层，只改 `layers.yml`：

```yaml
version: "1"
layers:
  - name: access
    description: 接入层，负责外部系统对接
    services: [ingest, data-writer, observability, registry]
  - name: processing
    description: 处理层，负责数据加工与业务处理
    services: [ingest, data-writer, dispatch-core, aggregator, observability, registry]
  - name: decision
    description: 决策层，负责全局调度决策
    services: [dispatch-core, observability, registry]
```

从三层加到四层，插入一段区域层：

```yaml
version: "1"
layers:
  - name: access
    services: [...]
  - name: region          # 新加
    services: [...]
  - name: processing
    services: [...]
  - name: decision
    services: [...]
```

**服务代码零改动，只改配置。**

### 2.6 服务与层的关系

| 服务 | 接入层 | 处理层 | 决策层 |
|---|---|---|---|
| ingest | 可部署 | 可部署 | 可部署 |
| data-writer | 可部署 | 可部署 | 可部署 |
| dispatch-core | 可部署 | 可部署 | 可部署 |
| aggregator | 可部署 | 可部署 | 可部署 |
| gateway | 可部署 | 可部署 | 可部署 |
| observability | 可部署 | 可部署 | 可部署 |
| registry | 可部署 | 可部署 | 可部署 |

同一服务在每层以不同配置运行，代码一份。

### 2.7 构建产物

`package.json` 的 build 脚本把 `layers.yml` 复制到 `dist/`：

```json
{
  "scripts": {
    "build": "tsc -b && node -e \"require('fs').copyFileSync('layers.yml','dist/layers.yml')\""
  }
}
```

TypeScript 只编译 `.ts`，`.yml` 不在编译产物里，必须手动 copy。

### 2.8 加载逻辑

`loadLayers` 的处理顺序：

1. 定位文件：默认 `__dirname/../layers.yml`，可传 `filePath` 覆盖。
2. 读文件：不存在抛错。
3. 解析 YAML：失败抛错，错误信息含原始原因。
4. zod 校验：失败列出所有 issue。
5. 层名唯一性检查：手动遍历，重复抛错。
6. 返回 `LayersConfig`。

### 2.9 测试覆盖

`tests/layerConfig.load.test.ts` 覆盖 7 个场景。

`tests/layerConfig.addLayer.test.ts` 覆盖 7 个场景。

## 三、V1 修改

无（首版）。

## 四、V2 修改

### 变更一：gateway 加入核心服务

**为什么改：** 阶段四 gateway 作为 HTTP 统一入口，属于核心服务，需要出现在 `KNOWN_SERVICES` 和 `layers.yml`。

**怎么改：**

1. `KNOWN_SERVICES` 加 `gateway`（阶段一已加，不需要动）。
2. `layers.yml` 的 `single` 层已含 `gateway`（不需要动）。
3. 阶段四不改代码，只确认已就位。

### 变更二：插件与层的关系明确

**为什么改：** 阶段四引入前端插件，需要明确"插件不属于层，层只决定核心服务"。

**怎么改：**

- 层配置只管核心服务，不管插件。
- 插件通过 `profile` 选择加载，不由层配置控制。
- `gateway` 是核心服务，它内部加载插件。
- `dashboard`、`geofence`、`anomaly` 是插件，不进 `KNOWN_SERVICES`。

**影响：** 无需改代码，只需文档说明。

## 五、V3 修改

### 变更一：新增 aggregator 核心服务

**为什么改：** 阶段五引入 aggregator 作为 `telemetry.aggregated` 的生产者。charging-scheduler、dashboard 等插件都依赖聚合遥测。

**怎么改：**

1. `KNOWN_SERVICES` 加 `aggregator`。
2. `layers.yml` 的 `single` 层加 `aggregator`。

**新增 `KNOWN_SERVICES`：**

```
infra
gateway
plugin-host
libs
ingest
data-writer
simulator
dispatch-core
aggregator       ← 新增
observability
registry
```

**新增 `layers.yml` 的 `single` 层：**

```yaml
layers:
  - name: single
    services:
      - infra
      - gateway
      - plugin-host
      - libs
      - ingest
      - data-writer
      - simulator
      - dispatch-core
      - aggregator     # 新增
      - observability
      - registry
```

**影响：**

- `registry.json` 的 `services` 从 10 个变成 11 个。
- 所有含 `dispatch-core` 的层都应同步加 `aggregator`（如果该层需要聚合能力）。
- 加层只改配置，服务代码零改动。

### 变更二：多层验证

**为什么改：** 阶段五要验证"加层只改配置，服务代码零改动"。

**怎么改：** 加 `tests/layerConfig.multiLayer.test.ts`，覆盖：

| 用例 | 验证 |
|---|---|
| 单层配置可加载 | `single` 层含所有 11 个服务 |
| 三层配置可加载 | `access` / `processing` / `decision` |
| 四层配置可加载 | 三层基础上加 `region` |
| 同一服务可在多层 | `ingest` 在 `access` 和 `processing` 同时启用 |
| 加层只改配置 | 从单层到两层，服务代码不动 |
| 层名重复抛错 | `access` 出现两次 |
| 未知服务名抛错 | `not-a-service` 不在白名单 |
| 非法层名抛错 | `Access_Layer` 不符合正则 |
| `getLayer` 不存在的层抛错 | `not-exist` |

**收益：** 层扩展能力得到自动化测试保障。

### 变更三：插件不进层配置

**为什么改：** 明确层配置只管核心服务，插件通过 profile 选择。

**怎么改：** 文档说明：

- `KNOWN_SERVICES` 白名单只含核心服务。
- 插件通过 `plugin.json` 的 `profile` 选择加载。
- `gateway` 是核心服务，负责加载插件。
- 层配置不控制插件的启动。

**对比：**

| 类别 | 控制方式 |
|---|---|
| 核心服务 | `layers.yml` 的 `services` 列表 |
| 插件 | `plugin.json` 的 `profile` 字段 + `GATEWAY_PROFILE` 环境变量 |

**举例：**

- `single` 层含 `aggregator`，所以 `aggregator` 服务启动。
- `plugins/charging-scheduler/plugin.json` 声明 `profile: ["core", "full"]`。
- `GATEWAY_PROFILE=core`，所以 `charging-scheduler` 插件加载。

两层控制独立，互不影响。

### 变更四：层配置与层部署

**为什么改：** 明确"层配置"和"层部署"的区别。

**怎么改：** 文档说明：

| 概念 | 位置 | 作用 |
|---|---|---|
| 层配置 | `shared/layer-config/layers.yml` | 声明每层启用哪些服务 |
| 层部署 | `deploy/`（阶段六） | 实际部署每层的服务实例 |

层配置是声明式的，告诉系统"某层应该包含哪些服务"。层部署是实际运行，可能在不同集群、不同节点。

**阶段五只做层配置，不做层部署。** 层部署留到阶段六。

## 六、后续版本

### 计划中的 V4

**层配置增加 `cluster` 字段，支持多集群：**

```yaml
layers:
  - name: access-east
    cluster: east
    services: [ingest, data-writer, observability, registry]
  - name: access-west
    cluster: west
    services: [ingest, data-writer, observability, registry]
  - name: decision
    cluster: center
    services: [dispatch-core, observability, registry]
```

**用途：** 地理分片，每个区域一个集群，各自独立扩展。

**需要额外设计：** 跨集群消息路由、跨集群一致性、跨集群查询、跨集群监控。

### 计划中的 V5

**层配置增加 `bus` 字段，不同层用不同总线：**

```yaml
layers:
  - name: access
    bus: mqtt
    services: [ingest, observability]
  - name: processing
    bus: kafka
    services: [data-writer, dispatch-core, aggregator, observability]
```

**用途：** 接入层用 MQTT（海量长连接），处理层用 Kafka（可靠可回溯）。

**需要额外设计：** 层间总线桥接、消息格式转换。

### 计划中的 V6

**层配置增加 `replicas` 字段，支持水平扩展：**

```yaml
layers:
  - name: access
    replicas: 3
    services: [ingest, data-writer, observability, registry]
  - name: processing
    replicas: 2
    services: [dispatch-core, aggregator, observability, registry]
```

**用途：** 每层独立设置副本数，接入层多副本抗海量连接，处理层按吞吐调优。

**需要额外设计：** 副本间的消费者组分配、状态一致性。

### 长期演进

- **层间通信协议设计**：跨层消息如何传递。
- **层间一致性方案**：层间数据如何保持一致。
- **跨层追踪**：如何追踪跨层调用链。
- **多集群部署**：如何部署到多个集群。
- **动态层管理**：运行时增加/移除层。

### 边界与注意事项

**层数不是越多越好：**

| 层数 | 优势 | 代价 |
|---|---|---|
| 1 层 | 简单、低延迟 | 单点压力大 |
| 2 层 | 边缘聚合 | 运维复杂 |
| 3 层 | 区域聚合 | 延迟增加 |
| 4 层+ | 中心压力极小 | 运维极复杂 |

**推荐策略：**

- 按规模选层数，不按理想选。
- 当前 1 层跑通闭环，未来按需扩展到 2 层、3 层、4 层。
- 加层前先确认瓶颈在哪，不预先优化。

**层配置的稳定性：**

- 层配置属于核心契约的一部分。
- 层名、服务名、schema 改动需谨慎。
- 加层、减层、调服务列表：兼容性改动，不破坏已有部署。
- 改层名、改 schema：破坏性改动，需版本化。

**测试覆盖：**

- 单元测试覆盖各查询函数。
- 多层测试覆盖加层、减层、非法输入。
- 未来加层部署测试（阶段六）。