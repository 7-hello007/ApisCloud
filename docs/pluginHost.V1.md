# 插件宿主 V1

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

## 四、后续版本

- 阶段四：插件注册到 gateway，动态注入路由
- 阶段四：前端插件通过 ESM 动态 import 加载
- 阶段五：插件懒加载、按需订阅