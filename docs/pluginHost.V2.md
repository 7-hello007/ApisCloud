# 插件宿主 V2

## 一、功能目标

进程内加载插件，统一管理生命周期。插件放在 `plugins/xxx/`，由 plugin-host 统一加载，核心代码零改动。

**为什么进程内：**

| 维度 | 独立进程 | 进程内 |
|---|---|---|
| 部署复杂度 | 每个插件一个容器 | 宿主统一加载 |
| 资源开销 | 每插件独立内存 | 共享宿主内存 |
| 通信开销 | 跨进程 | 函数调用 |
| 启动速度 | 慢 | 快 |
| 调试难度 | 跨进程 | 同进程 |

## 二、基础实现

### 2.1 文件位置

```
core/plugin-host/
├── src/
│   ├── types.ts       — Plugin 接口、PluginContext、PluginManifest、LoadedPlugin
│   ├── schema.ts      — plugin.json zod 校验
│   ├── guard.ts       — withTimeout、safeCall
│   ├── loader.ts      — 读 manifest + 动态加载入口
│   ├── registry.ts    — 内存注册表
│   ├── lifecycle.ts   — onLoad / onUnload
│   ├── host.ts        — PluginHost 类
│   └── index.ts       — 统一出口
└── package.json
```

### 2.2 插件接口

```ts
interface Plugin {
  onLoad?(ctx: PluginContext): Promise<void> | void;
  onUnload?(): Promise<void> | void;
  onMessage?(topic: string, envelope: Envelope): Promise<void> | void;
  onTimer?(): Promise<void> | void;
  getRoutes?(): Route[];
  getHealth?(): PluginHealth | Promise<PluginHealth>;
}
```

所有方法可选，插件只实现需要的。

### 2.3 plugin.json

```json
{
  "name": "nearest-dispatch",
  "version": "1.0.0",
  "core": false,
  "profile": ["core", "full"],
  "lazy": true,
  "dependsOn": [],
  "topics": {
    "subscribe": ["telemetry.aggregated"],
    "publish": ["events.commands"]
  },
  "routes": [],
  "frontend": null
}
```

### 2.4 PluginHost 公开方法

| 方法 | 作用 |
|---|---|
| `register(loaded)` | 注册已加载的插件 |
| `loadAll(profile?)` | 加载（可按 profile 过滤）并调 onLoad |
| `unloadAll()` | 逆序卸载，调 onUnload |
| `dispatchMessage(topic, env)` | 分发给订阅了该主题的插件 |
| `dispatchTimer()` | 定时调用所有插件的 onTimer |
| `getRoutes()` | 聚合所有插件暴露的路由 |
| `health()` | 聚合所有插件的健康状态 |
| `getRegistry()` | 暴露注册表 |

### 2.5 基础保护

| 保护 | 做法 |
|---|---|
| 异常保护 | 每个回调 try/catch，崩溃不影响宿主 |
| 超时控制 | onLoad 5s、onUnload 5s、onMessage 1s、onTimer 1s |
| 命名空间 | 插件 ID 前缀 |
| 版本隔离 | 每个插件独立版本 |

### 2.6 模板插件

`plugins/_template/` 含 `plugin.json` + `src/index.js`，复制即用。扫描时跳过 `_` 开头的目录。

### 2.7 即插即用

新增插件的完整流程：

1. 从 `plugins/_template/` 复制目录。
2. 修改 `plugin.json`（name、version、profile 等）。
3. 写后端 `src/index.js`。
4. 运行 `make build-registry`。
5. 启动时按 profile 自动加载。

**核心代码零改动，网关零改动，前端外壳零改动。**

## 三、V1 修改

无（首版）。

## 四、V2 修改

### 变更一：PluginContext 增加 bus、createEnvelope、topics

**为什么改：**

阶段四要把 geofence 和 anomaly 接入 plugin-host，两个插件都需要发 `events.alerts`。原来插件直接 `require('@apiscloud/message-bus')`，导致两个问题：

1. `plugins/` 目录不在 pnpm workspace 里，`require('@apiscloud/message-bus')` 找不到包。
2. 插件依赖主项目的 npm 包，无法真正独立分发。

**怎么改：**

在 `PluginContext` 里注入消息总线相关依赖：

```ts
export interface PluginContext {
  pluginId: string;
  logger: Logger;
  /** 插件可通过此总线发布消息（阶段四新增，可选） */
  bus?: MessageBus;
  /** 创建标准信封（阶段四新增，可选） */
  createEnvelope?: <T>(options: CreateEnvelopeOptions<T>) => Envelope<T>;
  /** 消息总线主题常量（阶段四新增，可选） */
  topics?: {
    TELEMETRY_RAW: TopicName;
    TELEMETRY_AGGREGATED: TopicName;
    EVENTS_COMMANDS: TopicName;
    EVENTS_ALERTS: TopicName;
  };
  /** 插件可选的运行时依赖由外部注入 */
  [key: string]: unknown;
}
```

**插件用法：**

```js
let bus = null;
let createEnvelope = null;
let TOPICS = null;

module.exports = {
  async onLoad(ctx) {
    if (ctx.bus) bus = ctx.bus;
    if (ctx.createEnvelope) createEnvelope = ctx.createEnvelope;
    if (ctx.topics) TOPICS = ctx.topics;

    ctx.logger.info(
      { hasBus: !!bus, hasHelpers: !!createEnvelope && !!TOPICS },
      '插件已加载',
    );
  },

  async onMessage(_topic, envelope) {
    // 从 envelope 提取数据
    const payload = envelope.payload;

    // 用注入的 createEnvelope 创建消息
    const alertEnv = createEnvelope({
      topic: TOPICS.EVENTS_ALERTS,
      source: 'my-plugin',
      payload: { ... },
    });

    // 用注入的 bus 发布
    await bus.publish(TOPICS.EVENTS_ALERTS, alertEnv, {
      partitionKey: payload.vehicle_id,
    });
  },
};
```

**影响：**

- 插件不再 `require('@apiscloud/message-bus')`。
- 插件所有消息总线依赖从 `ctx` 拿。
- 插件真正独立可分发了。
- `plugins/` 目录不需要进 pnpm workspace。

### 变更二：PluginHostOptions 增加 bus

**为什么改：**

PluginHost 需要把 bus 传给插件的 `ctx`。

**怎么改：**

```ts
export interface PluginHostOptions {
  config: AppConfig;
  logger?: Logger;
  /** 插件可用的消息总线（阶段四新增，可选） */
  bus?: MessageBus;
  loadTimeoutMs?: number;
  unloadTimeoutMs?: number;
  messageTimeoutMs?: number;
  timerTimeoutMs?: number;
}
```

`PluginHost` 构造函数保存 bus：

```ts
constructor(options: PluginHostOptions) {
  this.config = options.config;
  this.bus = options.bus;
  // ...
}
```

### 变更三：buildContext 注入 bus、createEnvelope、topics

**为什么改：**

把依赖注入到每个插件的 `ctx`。

**怎么改：**

```ts
private buildContext(plugin: LoadedPlugin): PluginContext {
  return {
    pluginId: plugin.manifest.name,
    logger: this.logger.child({ plugin: plugin.manifest.name }),
    config: this.config,
    bus: this.bus,
    createEnvelope,
    topics: {
      TELEMETRY_RAW: TOPICS.TELEMETRY_RAW,
      TELEMETRY_AGGREGATED: TOPICS.TELEMETRY_AGGREGATED,
      EVENTS_COMMANDS: TOPICS.EVENTS_COMMANDS,
      EVENTS_ALERTS: TOPICS.EVENTS_ALERTS,
    },
  };
}
```

`createEnvelope` 和 `TOPICS` 直接从 `@apiscloud/message-bus` 导入。

### 变更四：插件不再 require 主项目包

**为什么改：**

配合变更一，让插件代码干净。

**怎么改：**

以 geofence 为例，原来：

```js
const { createEnvelope, TOPICS } = require('@apiscloud/message-bus');
```

改成：

```js
// 不再 require；bus、createEnvelope、TOPICS 从 ctx 拿
```

**影响：**

- 插件代码里没有 `require('@apiscloud/message-bus')`。
- 只在 `onLoad(ctx)` 里接收注入的依赖。
- 测试时可以通过 `_setHelpers` 或走 PluginHost 注入。

### 变更五：gateway 集成 plugin-host

**为什么改：**

阶段四 gateway 要作为 HTTP 入口，同时作为插件宿主，聚合插件路由，转发消息给插件。

**怎么改：**

gateway 内部创建 `PluginHost`，注入 bus：

```ts
const pluginHost = new PluginHost({
  config: options.config,
  logger: observability.logger,
  bus,
});
```

从 `pluginDirs` 加载插件，注册到 `pluginHost`。

**启动流程：**

1. 连接 bus
2. `pluginHost.loadAll(profile)` 加载插件
3. `pluginHost.getRoutes()` 聚合插件路由
4. 订阅插件 `manifest.topics.subscribe` 声明的主题
5. 启动 gateway HTTP 服务器

**消息桥：**

gateway 订阅 `telemetry.raw`（或其他插件关心的主题），消息到达时：

```ts
await pluginHost.dispatchMessage(topic, env);
```

`dispatchMessage` 遍历所有订阅了该主题的插件，调用它们的 `onMessage`。

### 变更六：PluginHost.health() 聚合插件健康

**为什么改：**

gateway 的 `/health` 要聚合 plugin-host 健康。

**怎么改：**

gateway 的 `/health` 里：

```ts
const hostHealth = await pluginHost.health();
checks['plugin-host'] = {
  status: hostHealth.status,
  message: Object.keys(hostHealth.checks).join(','),
};
```

`PluginHost.health()` 返回 `HealthReport`：

```ts
{
  status: 'ok' | 'degraded' | 'down',
  service: 'plugin-host',
  timestamp: '...',
  uptimeSec: 123,
  checks: {
    geofence: { status: 'ok', message: 'zones: 1, hasBus: true' },
    anomaly: { status: 'ok', message: 'tracked vehicles: 0, hasBus: true' },
    // ...
  },
}
```

### 变更七：测试辅助方法 `_setHelpers`

**为什么改：**

测试直接调插件（不走 PluginHost）时，需要手动注入 helpers。

**怎么改：**

在插件里加：

```js
module.exports = {
  // ...
  _setHelpers(helpers) {
    if (helpers.createEnvelope) createEnvelope = helpers.createEnvelope;
    if (helpers.topics) TOPICS = helpers.topics;
  },
};
```

**测试用法：**

```ts
const geofence = require('../plugins/geofence/src/index.js');
geofence._setHelpers({
  createEnvelope: require('@apiscloud/message-bus').createEnvelope,
  topics: require('@apiscloud/message-bus').TOPICS,
});
geofence.setBus(mockBus);
```

**生产走 PluginHost，不用 `_setHelpers`。**

## 五、后续版本

### 已完成（V2 阶段四）

- ✅ 插件注册到 gateway，动态注入路由
- ✅ 前端插件通过 ESM 动态 import 加载
- ✅ PluginContext 注入 bus、createEnvelope、topics
- ✅ PluginHostOptions 支持 bus
- ✅ buildContext 注入 helpers
- ✅ 插件不再 require 主项目包
- ✅ gateway 集成 plugin-host
- ✅ health 聚合插件健康

### 计划中（阶段五）

- 插件懒加载（`lazy: true` 时按需加载）
- 插件版本兼容性检查（`core_version`）
- 插件按需订阅（`filter` 声明）
- 插件共享消费者组（相似插件共享 groupId）
- 插件性能指标（`pluginActions`、`pluginDuration`）

### 计划中（阶段六）

- 插件签名与验证
- 插件权限声明
- 插件灰度加载
- 插件热更新（不重启宿主）

### 长期演进

- 插件远程加载（HTTP / OCI 镜像）
- 插件多版本共存
- 插件沙箱隔离（Worker / VM）
- 插件市场

---

**这份 V2 文档：**

1. **完整保留了 V1 的所有内容**（一、功能目标；二、基础实现；三、V1 修改）。
2. **新增了"四、V2 修改"**，包含 7 个变更：
   - PluginContext 增加 bus、createEnvelope、topics
   - PluginHostOptions 增加 bus
   - buildContext 注入 helpers
   - 插件不再 require 主项目包
   - gateway 集成 plugin-host
   - PluginHost.health() 聚合插件健康
   - 测试辅助方法 `_setHelpers`
3. **更新了"五、后续版本"**，把阶段四完成的内容打勾，阶段五/六的计划分类列出。
4. **符合 docs/README.md 的模板**：功能目标 / 基础实现 / V1 修改 / V2 修改 / 后续版本。
