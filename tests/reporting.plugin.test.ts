/* eslint-disable @typescript-eslint/no-require-imports */
import { loadConfig, resetConfig } from '@apiscloud/libs';
import { PluginHost, type LoadedPlugin } from '@apiscloud/plugin-host';
import { MemoryAdapter } from '@apiscloud/message-bus';

const plugin = require('../plugins/reporting/src/index.js');

function makeLoadedPlugin(): LoadedPlugin {
  return {
    manifest: {
      name: 'reporting',
      version: '1.0.0',
      core: false,
      profile: ['test'],
      lazy: true,
      dependsOn: [],
      topics: { subscribe: [], publish: [] },
      routes: ['/api/reporting/summary', '/api/reporting/vehicles', '/api/reporting/alerts'],
      frontend: null,
    },
    instance: plugin,
    path: '/fake/reporting',
    loadedAt: Date.now(),
  };
}

interface MockHttp {
  responses: Map<string, unknown>;
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
}

function createMockHttp(): MockHttp {
  const responses = new Map<string, unknown>();
  return {
    responses,
    async get<T>(url: string): Promise<T> {
      if (!responses.has(url)) {
        throw new Error(`MockHttp: no response for ${url}`);
      }
      return responses.get(url) as T;
    },
    async post<T>(): Promise<T> {
      throw new Error('not implemented');
    },
  };
}

// ============================================================
// Mock Response
// ============================================================

interface MockResponse {
  statusCode: number;
  writeHead: (status: number, headers?: Record<string, string>) => void;
  end: (body?: string) => void;
  getBody: () => Record<string, unknown>;
}

function createMockResponse(): MockResponse {
  let body = '';
  return {
    statusCode: 0,
    writeHead(status: number) {
      this.statusCode = status;
    },
    end(chunk?: string) {
      if (chunk) body = chunk;
    },
    getBody() {
      return JSON.parse(body) as Record<string, unknown>;
    },
  };
}

// ============================================================
// 类型化的 body 访问
// ============================================================

interface SummaryBody {
  generated_at: string;
  vehicles: { total: number; byStatus: Record<string, number> };
  alerts: { total: number; byLevel: Record<string, number> };
  commands: { total: number };
}

interface VehiclesBody {
  summary: { total: number; byStatus: Record<string, number> };
}

interface AlertsBody {
  summary: { total: number; byLevel: Record<string, number> };
}

describe('reporting.plugin', () => {
  let host: PluginHost;
  let bus: MemoryAdapter;
  let mockHttp: MockHttp;

  beforeEach(async () => {
    resetConfig();
    plugin._reset();

    bus = new MemoryAdapter();
    await bus.connect();

    mockHttp = createMockHttp();

    host = new PluginHost({ config: loadConfig(), bus });
    host.register(makeLoadedPlugin());
    await host.loadAll();

    plugin._setHttp(mockHttp);
    plugin._setServices({ dataWriter: 'http://mock-data-writer' });
  });

  afterEach(async () => {
    await host.unloadAll();
    await bus.close();
    plugin._reset();
  });

  it('插件加载后暴露 3 个路由', () => {
    const routes = plugin.getRoutes();
    expect(routes).toHaveLength(3);
    const paths = routes.map((r: { path: string }) => r.path);
    expect(paths).toContain('/api/reporting/summary');
    expect(paths).toContain('/api/reporting/vehicles');
    expect(paths).toContain('/api/reporting/alerts');
  });

  it('summary 端点：组合 3 个查询', async () => {
    mockHttp.responses.set('http://mock-data-writer/api/query/vehicles/active', {
      count: 2,
      vehicles: [
        { vehicle_id: 'v-1', status: 'running', battery: 80 },
        { vehicle_id: 'v-2', status: 'idle', battery: 10 },
      ],
    });
    mockHttp.responses.set('http://mock-data-writer/api/query/alerts/recent', {
      count: 1,
      alerts: [{ vehicle_id: 'v-1', level: 'warning', alert_type: 'speed_anomaly' }],
    });
    mockHttp.responses.set('http://mock-data-writer/api/query/commands/recent', {
      count: 0,
      commands: [],
    });

    const routes = plugin.getRoutes();
    const summaryRoute = routes.find((r: { path: string }) => r.path === '/api/reporting/summary');

    const res = createMockResponse();
    await summaryRoute.handler({}, res);

    expect(res.statusCode).toBe(200);
    const body = res.getBody() as unknown as SummaryBody;
    expect(body.vehicles.total).toBe(2);
    expect(body.alerts.total).toBe(1);
    expect(body.commands.total).toBe(0);
  });

  it('vehicles 端点：返回车辆汇总', async () => {
    mockHttp.responses.set('http://mock-data-writer/api/query/vehicles/active', {
      count: 2,
      vehicles: [
        { vehicle_id: 'v-1', status: 'running', battery: 80 },
        { vehicle_id: 'v-2', status: 'running', battery: 60 },
      ],
    });

    const routes = plugin.getRoutes();
    const vehiclesRoute = routes.find(
      (r: { path: string }) => r.path === '/api/reporting/vehicles',
    );

    const res = createMockResponse();
    await vehiclesRoute.handler({}, res);

    expect(res.statusCode).toBe(200);
    const body = res.getBody() as unknown as VehiclesBody;
    expect(body.summary.total).toBe(2);
    expect(body.summary.byStatus.running).toBe(2);
  });

  it('alerts 端点：返回告警汇总', async () => {
    mockHttp.responses.set('http://mock-data-writer/api/query/alerts/recent', {
      count: 2,
      alerts: [
        { vehicle_id: 'v-1', level: 'warning', alert_type: 'speed_anomaly' },
        { vehicle_id: 'v-2', level: 'critical', alert_type: 'battery_drop' },
      ],
    });

    const routes = plugin.getRoutes();
    const alertsRoute = routes.find((r: { path: string }) => r.path === '/api/reporting/alerts');

    const res = createMockResponse();
    await alertsRoute.handler({}, res);

    expect(res.statusCode).toBe(200);
    const body = res.getBody() as unknown as AlertsBody;
    expect(body.summary.total).toBe(2);
    expect(body.summary.byLevel.warning).toBe(1);
    expect(body.summary.byLevel.critical).toBe(1);
  });

  it('data-writer 不可达时返回 500', async () => {
    const routes = plugin.getRoutes();
    const summaryRoute = routes.find((r: { path: string }) => r.path === '/api/reporting/summary');

    const res = createMockResponse();
    await summaryRoute.handler({}, res);

    expect(res.statusCode).toBe(500);
  });

  it('没有 data-writer URL 时返回 503', async () => {
    plugin._setServices({});

    const routes = plugin.getRoutes();
    const summaryRoute = routes.find((r: { path: string }) => r.path === '/api/reporting/summary');

    const res = createMockResponse();
    await summaryRoute.handler({}, res);

    expect(res.statusCode).toBe(503);
  });
});
