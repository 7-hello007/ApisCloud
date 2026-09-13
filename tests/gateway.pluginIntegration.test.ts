/* eslint-disable @typescript-eslint/no-require-imports */
import path from 'node:path';

import {
  loadConfig,
  resetConfig,
  type HealthCheckResult,
  type PgClient,
  type RedisWrapper,
} from '@apiscloud/libs';
import {
  createDataWriterService,
  type DataWriterService,
} from '@apiscloud/data-writer';
import { createGatewayService, type GatewayService } from '@apiscloud/gateway';
import { createEnvelope, MemoryAdapter, TOPICS } from '@apiscloud/message-bus';

import { waitFor } from './helpers';

const PLUGINS_DIR = path.resolve(__dirname, '..', 'plugins');

interface MockPg extends PgClient {
  readonly alertInserts: unknown[][];
}

function createMockPg(): MockPg {
  const alertInserts: unknown[][] = [];
  return {
    alertInserts,
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('INSERT INTO alerts') && params) {
        alertInserts.push(params);
      }
      return { rows: [], rowCount: 0 } as never;
    },
    async transaction() {
      throw new Error('not implemented');
    },
    async health(): Promise<HealthCheckResult> {
      return { status: 'ok' };
    },
    async close() {},
    raw() {
      throw new Error('not implemented');
    },
  } as unknown as MockPg;
}

function createMockRedis(): RedisWrapper {
  return {
    async get() {
      return null;
    },
    async set() {},
    async del() {},
    async hset() {},
    async hgetall() {
      return {};
    },
    async hget() {
      return null;
    },
    async publish() {},
    async subscribe() {},
    async health(): Promise<HealthCheckResult> {
      return { status: 'ok' };
    },
    async close() {},
    raw() {
      return {
        sadd: async () => 1,
        lpush: async () => 1,
        ltrim: async () => 'OK',
      } as never;
    },
  } as RedisWrapper;
}

describe('gateway.pluginIntegration', () => {
  let bus: MemoryAdapter;
  let gateway: GatewayService;
  let dataWriter: DataWriterService;
  let mockPg: MockPg;
  let mockRedis: RedisWrapper;

  const INSIDE = { lat: 31.2304, lng: 121.4737 };
  const OUTSIDE = { lat: 31.9, lng: 121.4737 };

  function makeTelemetry(
    vehicleId: string,
    overrides: Partial<{
      lat: number;
      lng: number;
      speed: number;
      battery: number;
      ts: number;
    }> = {},
  ) {
    return {
      vehicle_id: vehicleId,
      ts: overrides.ts ?? Date.now(),
      lat: overrides.lat ?? 31.2304,
      lng: overrides.lng ?? 121.4737,
      speed: overrides.speed ?? 30,
      battery: overrides.battery ?? 80,
      heading: 90,
      status: 'running',
    };
  }

  beforeEach(async () => {
    resetConfig();
    bus = new MemoryAdapter();
    mockPg = createMockPg();
    mockRedis = createMockRedis();

    process.env.GATEWAY_PLUGIN_DIRS = PLUGINS_DIR;

    gateway = createGatewayService({
      config: loadConfig({ SERVICE_NAME: 'gateway' }),
      port: 0,
      bus,
    });

    dataWriter = createDataWriterService({
      config: loadConfig({ SERVICE_NAME: 'data-writer' }),
      port: 0,
      pg: mockPg,
      redis: mockRedis,
      bus,
    });

    await gateway.start();
    await dataWriter.start();
  });

  afterEach(async () => {
    await dataWriter.stop();
    await gateway.stop();
    delete process.env.GATEWAY_PLUGIN_DIRS;
  });

  it('gateway 启动时加载了 geofence 和 anomaly 插件', () => {
    const names = gateway.pluginHost.getRegistry().list().map((p) => p.manifest.name);
    expect(names).toContain('geofence');
    expect(names).toContain('anomaly');
  });

  it('gateway 订阅了 telemetry.raw，能转发给插件', async () => {
    await bus.publish(
      TOPICS.TELEMETRY_RAW,
      createEnvelope({
        topic: TOPICS.TELEMETRY_RAW,
        source: 'test',
        payload: makeTelemetry('v-000001', INSIDE),
      }),
      { partitionKey: 'v-000001' },
    );
    await bus.publish(
      TOPICS.TELEMETRY_RAW,
      createEnvelope({
        topic: TOPICS.TELEMETRY_RAW,
        source: 'test',
        payload: makeTelemetry('v-000001', OUTSIDE),
      }),
      { partitionKey: 'v-000001' },
    );

    await waitFor(() => mockPg.alertInserts.length >= 1);
    expect(mockPg.alertInserts[0][1]).toBe('geofence_exit');
  });

  it('anomaly 通过 gateway 分发触发告警', async () => {
    await bus.publish(
      TOPICS.TELEMETRY_RAW,
      createEnvelope({
        topic: TOPICS.TELEMETRY_RAW,
        source: 'test',
        payload: makeTelemetry('v-000002', { speed: 150 }),
      }),
      { partitionKey: 'v-000002' },
    );

    await waitFor(() => mockPg.alertInserts.length >= 1);
    expect(mockPg.alertInserts[0][1]).toBe('speed_anomaly');
  });

  it('gateway /health 聚合 plugin-host 健康', async () => {
    const port = gateway.port();
    const res = await fetch(`http://localhost:${port}/health`);
    const body = (await res.json()) as {
      status: string;
      checks: Record<string, { status: string }>;
    };
    expect(body.checks['plugin-host']).toBeDefined();
    expect(body.checks['plugin-host'].status).toBe('ok');
  });

  it('gateway /api/registry 返回插件清单', async () => {
    const port = gateway.port();
    const res = await fetch(`http://localhost:${port}/api/registry`);
    const body = (await res.json()) as {
      plugins: Array<{ name: string }>;
      byProfile: Record<string, string[]>;
    };
    const names = body.plugins.map((p) => p.name);
    expect(names).toContain('geofence');
    expect(names).toContain('anomaly');
    expect(body.byProfile.core).toBeDefined();
  });

  it('gateway 404 兜底', async () => {
    const port = gateway.port();
    const res = await fetch(`http://localhost:${port}/not-exist`);
    expect(res.status).toBe(404);
  });
});
