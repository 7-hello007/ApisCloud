# 层配置 V2

## 一、功能目标

把「服务」和「层」解耦。服务是逻辑单元，层是部署单元；加层只改配置，服务代码零改动。

核心思想：

- 服务：逻辑功能，如 dispatch-core、ingest、data-writer。
- 层：部署位置，如接入层、处理层、决策层。
- 服务实例：服务在某一层的具体运行实例。
- 层配置：声明某层启用哪些服务。
- 插件：附加功能，不属于任何层，通过 profile 选择加载。

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

当前单层结构，10 个核心服务集中运行：

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
    services: [ingest, data-writer, dispatch-core, observability, registry]
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
| gateway | 可部署 | 可部署 | 可部署 |
| observability | 可部署 | 可部署 | 可部署 |
| registry | 可部署 | 可部署 | 可部署 |

同一服务在每层以不同配置运行，代码一份。

### 2.7 服务与插件的关系

**服务是逻辑单元，插件是扩展单元。二者维度不同。**

| 维度 | 服务 | 插件 |
|---|---|---|
| 归属 | 核心，冻结维护 | 附加，自由迭代 |
| 配置位置 | `layers.yml` 的 `services` | `plugin.json` 的 `profile` |
| 是否进白名单 | 是（`KNOWN_SERVICES`） | 否 |
| 加载方 | 启动脚本按层启动 | gateway / plugin-host 按 profile 加载 |
| 是否占端口 | 是（HTTP 服务） | 否（进程内运行） |
| 示例 | ingest、dispatch-core、gateway | dashboard、geofence、anomaly、nearest |

**关键规则：**

- 层配置只管核心服务，不管插件。
- 插件通过 `profile` 选择加载，不由 `layers.yml` 控制。
- gateway 是核心服务，它内部加载插件。
- dashboard、geofence、anomaly、nearest、batch-match、priority-dispatch 是插件，不进 `KNOWN_SERVICES`。

### 2.8 构建产物

`package.json` 的 build 脚本把 `layers.yml` 复制到 `dist/`，让运行时 `__dirname/../layers.yml` 能找到：

```json
{
  "scripts": {
    "build": "tsc -b && node -e \"require('fs').copyFileSync('layers.yml','dist/layers.yml')\""
  }
}
```

TypeScript 只编译 `.ts`，`.yml` 不在编译产物里，必须手动 copy。

### 2.9 加载逻辑

`loadLayers` 的处理顺序：

1. 定位文件：默认 `__dirname/../layers.yml`，可传 `filePath` 覆盖。
2. 读文件：不存在抛错。
3. 解析 YAML：失败抛错，错误信息含原始原因。
4. zod 校验：失败列出所有 issue。
5. 层名唯一性检查：手动遍历，重复抛错。
6. 返回 `LayersConfig`。

### 2.10 测试覆盖

`tests/layerConfig.load.test.ts` 覆盖 7 个场景：

- 加载 `layers.yml`
- 当前只有一层 `single`
- `single` 层包含 10 个核心服务
- `isServiceEnabled` 判断正确
- `getLayer` 不存在时抛错
- `getServices` 不存在时抛错
- 文件不存在抛错

`tests/layerConfig.addLayer.test.ts` 覆盖 7 个场景：

- 加一层只需改配置
- 三层配置可加载
- 层名重复抛错
- 未知服务名抛错
- 空服务列表抛错
- 空 layers 抛错
- 非法层名抛错

## 三、V1 修改

无（首版）。

## 四、V2 修改

### 变更一：gateway 确认为核心服务

**为什么改：** 阶段四 gateway 作为 HTTP 统一入口上线，需要在层配置里明确它是核心服务。

**怎么改：**

1. `KNOWN_SERVICES` 已含 `gateway`（阶段一已加，无需改动）。
2. `layers.yml` 的 `single` 层已含 `gateway`（阶段一已加，无需改动）。
3. 阶段四只确认，不改代码。

**影响：** 无代码改动，文档明确说明。

### 变更二：明确插件与层的关系

**为什么改：** 阶段四引入前端插件和业务插件（dashboard、geofence、anomaly、nearest 等），需要明确"插件不属于层"。

**怎么改：**

- 层配置只管核心服务，不管插件。
- 插件通过 `plugin.json` 的 `profile` 字段选择加载。
- `KNOWN_SERVICES` 只列核心服务，不列插件。
- gateway 是核心服务，它负责加载插件。

**影响：**

- 无代码改动。
- `layers.yml` 不变。
- 插件清单通过 `core/registry/registry.json` 独立管理。

### 变更三：服务与插件的关系表

**为什么改：** 帮助开发者理解"为什么 geofence 不在 layers.yml 里"。

**怎么改：** 新增 2.7 节的服务与插件关系表。

**影响：** 无代码改动。

## 五、后续版本

### 计划中的 V3

- 层配置增加 `cluster` 字段，支持多集群：

```yaml
layers:
  - name: access-east
    cluster: east
    services: [...]
  - name: access-west
    cluster: west
    services: [...]
```

### 计划中的 V4

- 层配置增加 `bus` 字段，不同层用不同总线：

```yaml
layers:
  - name: access
    bus: mqtt
    services: [...]
  - name: processing
    bus: kafka
    services: [...]
```

### 计划中的 V5

- 层配置增加 `replicas` 字段，支持水平扩展：

```yaml
layers:
  - name: access
    replicas: 3
    services: [...]
```

### 长期演进

- 层间通信协议设计
- 层间一致性方案
- 跨层追踪
- 多集群部署

**注意：** 层数不是越多越好。每加一层，延迟和运维复杂度增加，收益递减。按规模选，不按理想选。

当前 1 层跑通闭环，未来按需扩展到 2 层、3 层、4 层。