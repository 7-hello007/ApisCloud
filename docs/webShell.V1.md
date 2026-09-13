# 前端外壳 V1

## 一、功能目标

前端外壳是插件的**展示宿主**，负责布局、路由、主题、UI 组件，动态加载插件前端模块。

**定位：**

- 独立于后端主项目（自己的 Vite 构建）
- 提供布局（Sidebar + Topbar + Main）
- 动态加载插件前端模块
- 导航栏由插件注册表驱动
- 提供基础 UI 组件

**数据流：**

```
插件注册表 ──→ /api/registry ──→ 前端 plugin-loader ──→ 注册表 ──→ Sidebar / Routes
```

## 二、基础实现

### 2.1 文件位置

```
web/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── public/favicon.svg
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── vite-env.d.ts
    ├── runtime/
    │   ├── registry.ts
    │   └── plugin-loader.ts
    ├── api/
    │   └── client.ts
    ├── shell/
    │   ├── Layout.tsx
    │   ├── Sidebar.tsx
    │   ├── Topbar.tsx
    │   └── ThemeProvider.tsx
    ├── components/ui/
    │   ├── Button.tsx
    │   ├── Card.tsx
    │   ├── Table.tsx
    │   ├── Badge.tsx
    │   ├── Input.tsx
    │   ├── Select.tsx
    │   ├── Spinner.tsx
    │   └── index.ts
    └── plugins/                — 前端插件（约定目录）
        └── dashboard/
            ├── index.tsx
            └── pages/
                ├── Overview.tsx
                ├── Vehicles.tsx
                ├── Alerts.tsx
                └── Commands.tsx
```

### 2.2 技术栈

| 层 | 技术 |
|---|---|
| 构建 | Vite 5 |
| 框架 | React 18 |
| 类型 | TypeScript 5 |
| 样式 | TailwindCSS 3 |
| 路由 | React Router 6 |

### 2.3 布局

```
┌──────────────────────────────────────────────┐
│ Topbar（状态、主题切换）                       │
├──────────┬───────────────────────────────────┤
│ Sidebar  │ Main（当前路由页面）                │
│ （导航）  │                                    │
│          │                                    │
└──────────┴───────────────────────────────────┘
```

**Sidebar** 由 `getNavGroups()` 驱动，从插件注册表聚合导航项，按 group 分组。

**Topbar** 显示服务状态（从 gateway `/health` 拉取），有主题切换按钮。

### 2.4 主题

深色 / 浅色切换，用 CSS 变量 + Tailwind。

| 类名 | Light | Dark |
|---|---|---|
| `bg-surface-900` | 白 | 深蓝 |
| `bg-surface-950` | 浅灰 | 最深 |
| `text-surface-100` | 深黑 | 浅白 |

CSS 变量在 `index.css` 的 `:root` 和 `.dark` 里定义。

`index.html` 里有内联脚本，在 React 之前读 localStorage 设置 class，避免首屏闪烁。

### 2.5 插件加载流程

1. 前端启动 → `loadPluginFrontends('core')`。
2. `fetch('/api/registry')` 拿插件清单。
3. 对每个声明了 `frontend` 的插件，从 `import.meta.glob` 预扫描表里找对应模块。
4. 动态 import，`registerPluginFrontend(mod.default)`。
5. `getRoutes()` 和 `getNavGroups()` 返回注册表数据。
6. `App.tsx` 渲染路由，`Sidebar.tsx` 渲染导航。

**约定：** `frontend` 字段是逻辑名（如 `"dashboard"`），前端找 `/src/plugins/dashboard/index.tsx`。

### 2.6 插件前端契约

```ts
interface PluginFrontend {
  name: string;                  // 必须与 plugin.json 的 name 一致
  navItems: NavItem[];           // 侧边栏项
  routes: PluginRoute[];         // 路由
}

interface NavItem {
  group: string;                 // 分组，如 '概览'
  label: string;                 // 显示标签
  path: string;                  // 路由路径
  icon?: string;                 // 图标（阶段四先不用）
  order?: number;                // 组内排序
}

interface PluginRoute {
  path: string;
  element: ReactElement;
}
```

### 2.7 API 客户端

`api.get`、`api.post` 打到 gateway，Vite 开发时通过 proxy 转到 `http://localhost:9101`。

`proxyPath(service, path)` 生成反向代理路径：`/api/proxy/{service}{path}`。

### 2.8 基础 UI 组件

| 组件 | 用途 |
|---|---|
| Button | 4 种 variant（primary / secondary / danger / ghost），3 种 size |
| Card | 卡片，带 title / subtitle / actions |
| Table | 泛型表格，支持 loading / empty |
| Badge | 5 种 variant（default / info / success / warning / danger） |
| Input | 输入框，带 label / error，支持 forwardRef |
| Select | 下拉框，带 label / options，支持 forwardRef |
| Spinner | 加载指示器，3 种 size |

纯 TailwindCSS，不引 UI 库。

### 2.9 开发与构建

**开发：**

```bash
cd web
pnpm dev
# http://localhost:5173
# Vite 代理 /api、/health、/metrics 到 gateway
```

**构建：**

```bash
cd web
pnpm build
# 输出 web/dist
```

### 2.10 环境变量

| 变量 | 说明 |
|---|---|
| GATEWAY_URL | Vite dev proxy 目标，默认 `http://localhost:9101` |

## 三、V1 修改

无（首版）。

## 四、后续版本

- 阶段五：静态文件服务（gateway 挂载 `web/dist`）
- 阶段五：WebSocket / SSE 实时推送
- 阶段五：插件前端懒加载（按需加载子路由）
- 阶段六：国际化（i18n）
- 阶段六：权限 UI（隐藏无权限的导航项）
- 阶段六：响应式（移动端适配）