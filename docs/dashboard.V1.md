# Dashboard 插件 V1

## 一、功能目标

dashboard 是**仪表板插件**，为前端提供总览、车辆、告警、指令四个页面。

**定位：**

- 前端插件，不是核心服务
- 后端为空壳（`src/index.js`），不提供业务 API
- 前端提供 navItems 和 routes，通过 `plugin.json` 的 `frontend` 字段声明
- 通过 gateway 的 `/api/registry` 暴露给前端，触发前端动态加载

**阶段四只做前端占位，真实数据接入留到阶段五。**

**数据流：**

```
plugin.json (frontend: "dashboard")
    │
    ▼
gateway 加载插件 → /api/registry 返回插件清单
    │
    ▼
前端 plugin-loader 按 frontend 名找 /src/plugins/dashboard/index.tsx
    │
    ▼
registerPluginFrontend → Sidebar 出现菜单，路由生效
```

## 二、基础实现

### 2.1 文件位置

**后端插件目录：**

```
plugins/dashboard/
├── plugin.json
└── src/
    └── index.js              — 后端空壳
```

**前端代码目录（约定）：**

```
web/src/plugins/dashboard/
├── index.tsx                 — 前端入口
└── pages/
    ├── Overview.tsx          — 总览页
    ├── Vehicles.tsx          — 车辆页
    ├── Alerts.tsx            — 告警页
    └── Commands.tsx          — 指令页
```

**说明：** 阶段四前端插件代码放在 `web/src/plugins/` 下，由 Vite 的 `import.meta.glob` 预扫描。前端插件代码与后端插件目录分开管理，阶段五再做统一的构建产物路径。

### 2.2 plugin.json

```json
{
  "name": "dashboard",
  "version": "1.0.0",
  "core": false,
  "profile": ["core", "full"],
  "lazy": true,
  "dependsOn": [],
  "topics": { "subscribe": [], "publish": [] },
  "routes": [],
  "frontend": "dashboard",
  "description": "仪表板前端：总览、车辆、告警、指令"
}
```

**关键字段：**

| 字段 | 值 | 说明 |
|---|---|---|
| `name` | `dashboard` | 必须与前端 PluginFrontend.name 一致 |
| `core` | `false` | 插件，不是核心服务 |
| `profile` | `["core", "full"]` | core 和 full profile 都加载 |
| `lazy` | `true` | 懒加载 |
| `topics` | 空 | dashboard 不订阅总线 |
| `frontend` | `"dashboard"` | 前端加载时找 `web/src/plugins/dashboard/index.tsx` |

### 2.3 后端空壳 `plugins/dashboard/src/index.js`

```js
'use strict';

/**
 * dashboard 插件后端。
 * 阶段四只做前端展示，后端不提供 API。
 * 真实数据接入留到阶段五。
 */

module.exports = {
  async onLoad(ctx) {
    ctx.logger.info('dashboard 插件已加载（前端模式）');
  },

  async onUnload() {
    // 无资源清理
  },

  async onTimer() {},

  getRoutes() {
    return [];
  },

  async getHealth() {
    return { status: 'ok', message: 'dashboard plugin (frontend-only)' };
  },
};
```

**后端不订阅总线、不暴露路由、不连接存储。** 只实现 6 个可选钩子中的必要方法，符合插件接口契约。

### 2.4 前端入口 `web/src/plugins/dashboard/index.tsx`

```tsx
import { Overview } from './pages/Overview';
import { Vehicles } from './pages/Vehicles';
import { Alerts } from './pages/Alerts';
import { Commands } from './pages/Commands';
import type { PluginFrontend } from '../../runtime/registry';

const frontend: PluginFrontend = {
  name: 'dashboard',
  navItems: [
    { group: '概览', label: '总览', path: '/', order: 1 },
    { group: '概览', label: '车辆', path: '/vehicles', order: 2 },
    { group: '监控', label: '告警', path: '/alerts', order: 1 },
    { group: '监控', label: '指令', path: '/commands', order: 2 },
  ],
  routes: [
    { path: '/', element: <Overview /> },
    { path: '/vehicles', element: <Vehicles /> },
    { path: '/alerts', element: <Alerts /> },
    { path: '/commands', element: <Commands /> },
  ],
};

export default frontend;
```

**`name` 必须与 `plugin.json` 的 `name` 一致**，否则前端注册表会出现两个不同名字的插件。

### 2.5 四个页面

| 页面 | 路径 | 阶段四内容 | 阶段五计划 |
|---|---|---|---|
| 总览 | `/` | 4 个统计卡片（占位 "—"）+ 地图占位 | 从 Redis 读真实统计 |
| 车辆 | `/vehicles` | 空表 + 说明文字 | 从 Redis `vehicles:active` 读 |
| 告警 | `/alerts` | 空表 + 说明文字 | 从 Redis `alerts:recent` 读 |
| 指令 | `/commands` | 空表 + 说明文字 | 从 PG `dispatch_commands` 读 |

### 2.6 页面实现

**`web/src/plugins/dashboard/pages/Overview.tsx`：**

```tsx
import { Card } from '../../../components/ui';

export function Overview() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-surface-100">总览</h1>
        <p className="text-sm text-surface-400 mt-1">
          智能驾驶服务调度平台运行状态
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="车辆总数" subtitle="vehicles:active">
          <div className="text-3xl font-semibold text-surface-100">—</div>
          <div className="text-xs text-surface-500 mt-1">阶段五接入数据</div>
        </Card>
        <Card title="在线车辆" subtitle="status = idle/running">
          <div className="text-3xl font-semibold text-surface-100">—</div>
          <div className="text-xs text-surface-500 mt-1">阶段五接入数据</div>
        </Card>
        <Card title="最近告警" subtitle="alerts:recent">
          <div className="text-3xl font-semibold text-surface-100">—</div>
          <div className="text-xs text-surface-500 mt-1">阶段五接入数据</div>
        </Card>
        <Card title="调度指令" subtitle="dispatch_commands">
          <div className="text-3xl font-semibold text-surface-100">—</div>
          <div className="text-xs text-surface-500 mt-1">阶段五接入数据</div>
        </Card>
      </div>

      <Card title="地图占位" subtitle="阶段五接入真实地图">
        <div className="h-80 flex items-center justify-center bg-surface-950 border border-surface-800 rounded text-surface-500">
          🗺️ 地图将在阶段五接入
        </div>
      </Card>
    </div>
  );
}
```

**`web/src/plugins/dashboard/pages/Vehicles.tsx`：**

```tsx
import { Card, Table, type Column } from '../../../components/ui';

interface VehicleRow {
  vehicle_id: string;
  status: string;
  battery: number;
  lat: number;
  lng: number;
}

export function Vehicles() {
  const columns: Column<VehicleRow>[] = [
    { key: 'vehicle_id', title: '车辆 ID' },
    { key: 'status', title: '状态' },
    {
      key: 'battery',
      title: '电量',
      align: 'right',
      render: (row) => `${row.battery}%`,
    },
    {
      key: 'lat',
      title: '纬度',
      align: 'right',
      render: (row) => row.lat.toFixed(4),
    },
    {
      key: 'lng',
      title: '经度',
      align: 'right',
      render: (row) => row.lng.toFixed(4),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-surface-100">车辆</h1>
        <p className="text-sm text-surface-400 mt-1">
          实时车辆列表（阶段五接入真实数据）
        </p>
      </div>

      <Card padded={false}>
        <Table<VehicleRow>
          columns={columns}
          rows={[]}
          rowKey={(r) => r.vehicle_id}
          empty="阶段五接入 Redis vehicles:active 后显示"
        />
      </Card>
    </div>
  );
}
```

**`web/src/plugins/dashboard/pages/Alerts.tsx`：**

```tsx
import { Card, Table, type Column } from '../../../components/ui';

interface AlertRow {
  ts: number;
  vehicle_id: string;
  alert_type: string;
  level: string;
  message: string;
}

export function Alerts() {
  const columns: Column<AlertRow>[] = [
    {
      key: 'ts',
      title: '时间',
      render: (row) => new Date(row.ts).toLocaleTimeString(),
    },
    { key: 'vehicle_id', title: '车辆' },
    { key: 'alert_type', title: '类型' },
    { key: 'level', title: '级别' },
    { key: 'message', title: '消息' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-surface-100">告警</h1>
        <p className="text-sm text-surface-400 mt-1">
          最近告警列表（阶段五接入真实数据）
        </p>
      </div>

      <Card padded={false}>
        <Table<AlertRow>
          columns={columns}
          rows={[]}
          rowKey={(r, i) => `${r.ts}-${i}`}
          empty="阶段五接入 Redis alerts:recent 后显示"
        />
      </Card>
    </div>
  );
}
```

**`web/src/plugins/dashboard/pages/Commands.tsx`：**

```tsx
import { Card, Table, type Column } from '../../../components/ui';

interface CommandRow {
  issued_at: string;
  command_id: string;
  vehicle_id: string;
  command_type: string;
  status: string;
}

export function Commands() {
  const columns: Column<CommandRow>[] = [
    {
      key: 'issued_at',
      title: '下发时间',
      render: (row) => new Date(row.issued_at).toLocaleString(),
    },
    { key: 'command_id', title: '指令 ID' },
    { key: 'vehicle_id', title: '车辆' },
    { key: 'command_type', title: '类型' },
    { key: 'status', title: '状态' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-surface-100">调度指令</h1>
        <p className="text-sm text-surface-400 mt-1">
          调度指令审计列表（阶段五接入真实数据）
        </p>
      </div>

      <Card padded={false}>
        <Table<CommandRow>
          columns={columns}
          rows={[]}
          rowKey={(r) => r.command_id}
          empty="阶段五接入 PG dispatch_commands 后显示"
        />
      </Card>
    </div>
  );
}
```

### 2.7 前端加载流程

```
1. 前端启动 → loadPluginFrontends('core')
2. fetch('/api/registry')
3. gateway 返回 plugins 数组，dashboard 项含 frontend: "dashboard"
4. 前端从 import.meta.glob 预扫描表找 /src/plugins/dashboard/index.tsx
5. 动态 import，拿到默认导出（PluginFrontend）
6. registerPluginFrontend(frontend)
7. getRoutes() 和 getNavGroups() 返回注册表数据
8. App.tsx 渲染路由，Sidebar.tsx 渲染导航
```

**`import.meta.glob` 是 Vite 编译时静态扫描：**

```ts
const frontendModules = import.meta.glob<{ default: PluginFrontend }>(
  '/src/plugins/*/index.tsx',
);
// 编译时展开为：
// {
//   '/src/plugins/dashboard/index.tsx': () => import('/src/plugins/dashboard/index.tsx'),
//   ...
// }
```

**为什么用 `import.meta.glob` 而不是动态 `import(path)`：**

- Vite 编译时能静态分析，打包进产物
- 支持 HMR
- 避免运行时任意路径 import 的安全问题

### 2.8 阶段四 vs 阶段五

| 项 | 阶段四 | 阶段五 |
|---|---|---|
| 菜单 | ✅ 出现 | ✅ 保持 |
| 路由 | ✅ 切换 | ✅ 保持 |
| 页面 | 占位（"—"、空表） | 真实数据 |
| 地图 | 占位 | 真实地图 SDK |
| API | 无 | data-writer 加 `/api/query/*` |
| 刷新 | 无 | 轮询或 SSE |

### 2.9 阶段五的数据接入方案

**问题：** dashboard 前端需要读 Redis / PG，但架构规定只有 data-writer 连库。

**方案：** data-writer 加查询端点，gateway 反向代理给 dashboard。

```
dashboard 前端 ──fetch──→ gateway ──/api/proxy/data-writer/api/query/vehicles──→ data-writer ──→ Redis
```

**data-writer 加的端点：**

| 端点 | 读什么 |
|---|---|
| `GET /api/query/vehicles/active` | Redis `vehicles:active` set |
| `GET /api/query/vehicles/:id` | Redis `vehicle:{id}:latest` |
| `GET /api/query/alerts/recent` | Redis `alerts:recent` list |
| `GET /api/query/commands/recent` | PG `dispatch_commands` 表 |

**dashboard 前端 fetch 路径：**

```ts
const res = await fetch('/api/proxy/data-writer/api/query/vehicles/active');
```

**这样符合架构原则：** 只有 data-writer 连库，dashboard 通过 HTTP 间接读。

## 三、V1 修改

无（首版）。

## 四、后续版本

- **阶段五：** 接入真实数据（Redis / PG）
- **阶段五：** 地图 SDK（Leaflet 或高德）
- **阶段五：** 实时刷新（轮询或 SSE）
- **阶段五：** 卡片点击跳转详情页
- **阶段六：** 多页表格分页、筛选、排序
- **阶段六：** 图表（ECharts 或 Recharts）
- **阶段六：** 导出（CSV / Excel）
- **阶段六：** 权限控制（隐藏无权限的菜单项）