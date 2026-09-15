/* eslint-disable @typescript-eslint/no-require-imports */
import path from 'node:path';

import { loadConfig, resetConfig } from '@apiscloud/libs';
import { createDataWriterService, type DataWriterService } from '@apiscloud/data-writer';
import { createGatewayService, type GatewayService } from '@apiscloud/gateway';
import { MemoryAdapter } from '@apiscloud/message-bus';

import { createMockPg, createMockRedis, type MockPg, type MockRedis } from './helpers/e2e-infra';

const PLUGINS_DIR = path.resolve(__dirname, '..', 'plugins');

/**
 * e2e 前端 API 测试：gateway → data-writer query → HTTP 响应。
 */
describe('e2e.frontendApi', () => {
  let bus: MemoryAdapter;
  let gateway: GatewayService;
  let dataWriter: DataWriterService;
  let mockPg: MockPg;
  let mockRedis: MockRedis;

  beforeEach(async () => {
    resetConfig();
    bus = new MemoryAdapter();
    mockPg = createMockPg();
    mockRedis = createMockRedis();

    process.env.GATEWAY_PLUGIN_DIRS = PLUGINS_DIR;

    // 1. 先创建 data-writer 并 start，拿到实际端口
    dataWriter = createDataWriterService({
      config: loadConfig({ SERVICE_NAME: 'data-writer' }),
      port: 0,
      pg: mockPg,
      redis: mockRedis,
      bus,
    });
    await dataWriter.start();

    // 2. 创建 gateway，注入 data-writer 的实际端口
    gateway = createGatewayService({
      config: loadConfig({ SERVICE_NAME: 'gateway' }),
      port: 0,
      bus,
      proxiedServices: [
        {
          name: 'data-writer',
          target: `http://localhost:${dataWriter.port()}`,
        },
      ],
    });
    await gateway.start();
  });

  afterEach(async () => {
    await gateway.stop();
    await dataWriter.stop();
    await bus.close();
    delete process.env.GATEWAY_PLUGIN_DIRS;
  });

  describe('gateway 基础端点', () => {
    it('GET /health 返回 ok + plugin-host', async () => {
      const res = await fetch(`http://localhost:${gateway.port()}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        checks: Record<string, { status: string }>;
      };
      expect(body.status).toBe('ok');
      expect(body.checks['plugin-host']).toBeDefined();
    });

    it('GET /metrics 返回 Prometheus 格式', async () => {
      const res = await fetch(`http://localhost:${gateway.port()}/metrics`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('apiscloud_http_requests_total');
    });

    it('GET /api/registry 返回插件清单', async () => {
      const res = await fetch(`http://localhost:${gateway.port()}/api/registry`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        plugins: Array<{ name: string }>;
        byProfile: Record<string, string[]>;
      };
      const names = body.plugins.map((p) => p.name);
      expect(names).toContain('dashboard');
      expect(names).toContain('geofence');
      expect(body.byProfile.core).toBeDefined();
    });
  });

  describe('反向代理到 data-writer', () => {
    it('GET /api/proxy/data-writer/health 代理到 data-writer', async () => {
      const res = await fetch(`http://localhost:${gateway.port()}/api/proxy/data-writer/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; service: string };
      expect(body.service).toBe('data-writer');
    });

    it('GET /api/proxy/data-writer/api/query/vehicles/active 返回车辆列表', async () => {
      const res = await fetch(
        `http://localhost:${gateway.port()}/api/proxy/data-writer/api/query/vehicles/active`,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        count: number;
        vehicles: unknown[];
      };
      expect(body.count).toBe(0);
      expect(body.vehicles).toEqual([]);
    });

    it('GET /api/proxy/data-writer/api/query/alerts/recent 返回告警列表', async () => {
      const res = await fetch(
        `http://localhost:${gateway.port()}/api/proxy/data-writer/api/query/alerts/recent`,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { count: number; alerts: unknown[] };
      expect(body.count).toBe(0);
      expect(body.alerts).toEqual([]);
    });

    it('GET /api/proxy/data-writer/api/query/commands/recent 返回指令列表', async () => {
      const res = await fetch(
        `http://localhost:${gateway.port()}/api/proxy/data-writer/api/query/commands/recent`,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        count: number;
        commands: unknown[];
      };
      expect(body.count).toBe(0);
      expect(body.commands).toEqual([]);
    });
  });

  describe('404 兜底', () => {
    it('GET /not-exist 返回 404', async () => {
      const res = await fetch(`http://localhost:${gateway.port()}/not-exist`);
      expect(res.status).toBe(404);
    });

    it('GET /api/proxy/unknown/health 返回 404', async () => {
      const res = await fetch(`http://localhost:${gateway.port()}/api/proxy/unknown/health`);
      expect(res.status).toBe(404);
    });
  });

  describe('data-writer 查询端点（通过 gateway 代理）', () => {
    it('写入数据后查询能返回', async () => {
      const mockRedisWithData = mockRedis as unknown as {
        raw: () => { smembers: () => Promise<string[]> };
      };
      const originalRaw = mockRedisWithData.raw.bind(mockRedis);
      mockRedisWithData.raw = () => ({
        ...originalRaw(),
        smembers: async () => ['v-000001', 'v-000002'],
      });

      (mockPg as unknown as { query: unknown }).query = async (sql: string, params?: unknown[]) => {
        if (sql.includes('vehicle_latest')) {
          return {
            rows: (params as string[]).map((id) => ({
              vehicle_id: id,
              status: 'running',
              battery: 80,
              lat: 31.2304,
              lng: 121.4737,
              heading: 90,
              speed: 30,
              updated_at: new Date().toISOString(),
            })),
            rowCount: params?.length ?? 0,
          };
        }
        return { rows: [], rowCount: 0 };
      };

      const res = await fetch(
        `http://localhost:${gateway.port()}/api/proxy/data-writer/api/query/vehicles/active`,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        count: number;
        vehicles: Array<{ vehicle_id: string }>;
      };
      expect(body.count).toBe(2);
      expect(body.vehicles.map((v) => v.vehicle_id)).toEqual(['v-000001', 'v-000002']);
    });
  });
});
