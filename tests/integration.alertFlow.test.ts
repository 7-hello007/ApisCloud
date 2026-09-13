/* eslint-disable @typescript-eslint/no-require-imports */
import path from 'node:path';

import {
  createLogger,
  loadConfig,
  type HealthCheckResult,
  type PgClient,
  type RedisWrapper,
} from '@apiscloud/libs';
import {
  createDataWriterService,
  type DataWriterService,
} from '@apiscloud/data-writer';
import { PluginHost, type LoadedPlugin } from '@apiscloud/plugin-host';
import { createEnvelope, MemoryAdapter, TOPICS } from '@apiscloud/message-bus';

import { waitFor } from './helpers';

const geofence = require(path.resolve(__dirname, '..', 'plugins', 'geofence', 'src', 'index.js'));
const anomaly = require(path.resolve(__dirname, '..', 'plugins', 'anomaly', 'src', 'index.js'));

// ============================================================
// Mock PG
// ============================================================

interface MockPg extends PgClient {
  readonly queries: Array<{ sql: string; params?: unknown[] }>;
  readonly alertInserts: unknown[][];
}

function createMockPg(): MockPg {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const alertInserts: unknown[][] = [];
  return {
    queries,
    alertInserts,
    async query(sql: string, params?: unknown[]) {
      queries.push({ sql, params });
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

// ============================================================
// Mock Redis
// ============================================================

interface MockRedis extends RedisWrapper {
  readonly sets: Array<{ key: string; value: string; ttl?: number }>;
  readonly lpushes: Array<{ key: string; value: string }>;
  readonly ltrims: Array<{ key: string; start: number; stop: number }>;
}

function createMockRedis(): MockRedis {
  const sets: Array<{ key: string; value: string; ttl?: number }> = [];
  const lpushes: Array<{ key: string; value: string }> = [];
  const ltrims: Array<{ key: string; start: number; stop: number }> = [];

  return {
    sets,
    lpushes,
    ltrims,
    async get() {
      return null;
    },
    async set(key, value, ttl) {
      sets.push({ key, value, ttl });
    },
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
        lpush: async (key: string, value: string) => {
          lpushes.push({ key, value });
          return 1;
        },
        ltrim: async (key: string, start: number, stop: number) => {
          ltrims.push({ key, start, stop });
          return 'OK';
        },
      } as never;
    },
  } as MockRedis;
}

// ============================================================
// 测试主体
// ============================================================

describe('integration.alertFlow（PluginHost 分发）', () => {
  let bus: MemoryAdapter;
  let host: PluginHost;
  let dataWriter: DataWriterService;
  let mockPg: MockPg;
  let mockRedis: MockRedis;

  beforeEach(async () => {
    bus = new MemoryAdapter();
    await bus.connect();

    mockPg = createMockPg();
    mockRedis = createMockRedis();

    // 重置插件内部状态
    geofence._reset();
    anomaly._reset();

    // 创建 PluginHost，注入 bus
    host = new PluginHost({
      config: loadConfig(),
      bus,
      logger: createLogger({ service: 'test', level: 'silent' }),
    });

    // 构造 LoadedPlugin 包装
    const geofenceLoaded: LoadedPlugin = {
      manifest: {
        name: 'geofence',
        version: '1.0.0',
        core: false,
        profile: ['test'],
        lazy: true,
        dependsOn: [],
        topics: { subscribe: [TOPICS.TELEMETRY_RAW], publish: [TOPICS.EVENTS_ALERTS] },
        routes: [],
        frontend: null,
      },
      instance: geofence,
      path: '/fake/geofence',
      loadedAt: Date.now(),
    };

    const anomalyLoaded: LoadedPlugin = {
      manifest: {
        name: 'anomaly',
        version: '1.0.0',
        core: false,
        profile: ['test'],
        lazy: true,
        dependsOn: [],
        topics: { subscribe: [TOPICS.TELEMETRY_RAW], publish: [TOPICS.EVENTS_ALERTS] },
        routes: [],
        frontend: null,
      },
      instance: anomaly,
      path: '/fake/anomaly',
      loadedAt: Date.now(),
    };

    host.register(geofenceLoaded);
    host.register(anomalyLoaded);
    await host.loadAll();

    // data-writer 订阅 events.alerts
    dataWriter = createDataWriterService({
      config: loadConfig({ SERVICE_NAME: 'data-writer' }),
      port: 0,
      pg: mockPg,
      redis: mockRedis,
      bus,
    });
    await dataWriter.start();
  });

  afterEach(async () => {
    await dataWriter.stop();
    await host.unloadAll();
    await bus.close();
  });

  // ============================================================
  // 辅助
  // ============================================================

  function makeTelemetryPayload(
    vehicleId: string,
    overrides: Partial<{
      lat: number;
      lng: number;
      speed: number;
      battery: number;
      ts: number;
      status: string;
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
      status: overrides.status ?? 'running',
    };
  }

  async function feed(
    vehicleId: string,
    overrides?: Parameters<typeof makeTelemetryPayload>[1],
  ): Promise<void> {
    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'simulator',
      payload: makeTelemetryPayload(vehicleId, overrides),
    });
    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env);
  }

  const INSIDE = { lat: 31.2304, lng: 121.4737 };
  const OUTSIDE = { lat: 31.9, lng: 121.4737 };

  // ============================================================
  // geofence
  // ============================================================

  describe('geofence 告警流（通过 PluginHost 分发）', () => {
    it('车辆从内到外触发 geofence_exit 告警，data-writer 写 PG alerts', async () => {
      await feed('v-000001', INSIDE);
      await feed('v-000001', OUTSIDE);

      await waitFor(() => mockPg.alertInserts.length >= 1);

      const params = mockPg.alertInserts[0];
      expect(params[0]).toBe('v-000001');
      expect(params[1]).toBe('geofence_exit');
      expect(params[2]).toBe('warning');
    });

    it('首次观测不产生告警', async () => {
      await feed('v-000001', OUTSIDE);
      await new Promise((r) => setTimeout(r, 100));
      expect(mockPg.alertInserts).toHaveLength(0);
    });

    it('告警同时写 PG alerts 和 Redis alerts:recent', async () => {
      await feed('v-000001', INSIDE);
      await feed('v-000001', OUTSIDE);

      await waitFor(() => mockPg.alertInserts.length >= 1);
      expect(mockRedis.lpushes).toHaveLength(1);
      expect(mockRedis.lpushes[0].key).toBe('alerts:recent');
    });
  });

  // ============================================================
  // anomaly 速度
  // ============================================================

  describe('anomaly 速度告警流（通过 PluginHost 分发）', () => {
    it('速度超阈值触发 speed_anomaly 告警', async () => {
      await feed('v-000001', { speed: 150 });

      await waitFor(() => mockPg.alertInserts.length >= 1);

      const params = mockPg.alertInserts[0];
      expect(params[0]).toBe('v-000001');
      expect(params[1]).toBe('speed_anomaly');
      expect(params[2]).toBe('warning');
    });

    it('速度正常不产生告警', async () => {
      await feed('v-000001', { speed: 60 });
      await new Promise((r) => setTimeout(r, 100));
      expect(mockPg.alertInserts).toHaveLength(0);
    });
  });

  // ============================================================
  // anomaly 电量
  // ============================================================

  describe('anomaly 电量骤降告警流（通过 PluginHost 分发）', () => {
    it('时间窗内电量骤降触发 battery_drop 告警', async () => {
      const now = Date.now();
      await feed('v-000001', { battery: 90, ts: now - 10_000 });
      await feed('v-000001', { battery: 60, ts: now });

      await waitFor(() => mockPg.alertInserts.length >= 1);

      const params = mockPg.alertInserts[0];
      expect(params[0]).toBe('v-000001');
      expect(params[1]).toBe('battery_drop');
      expect(params[2]).toBe('critical');
    });

    it('无上一状态时不产生告警', async () => {
      await feed('v-000001', { battery: 60 });
      await new Promise((r) => setTimeout(r, 100));
      expect(mockPg.alertInserts).toHaveLength(0);
    });

    it('超出时间窗不产生告警', async () => {
      const now = Date.now();
      await feed('v-000001', { battery: 90, ts: now - 60_000 });
      await feed('v-000001', { battery: 60, ts: now });
      await new Promise((r) => setTimeout(r, 100));
      expect(mockPg.alertInserts).toHaveLength(0);
    });
  });

  // ============================================================
  // 混合
  // ============================================================

  describe('混合场景', () => {
    it('geofence 和 anomaly 同时发告警，都到达 data-writer', async () => {
      const now = Date.now();

      await feed('v-000001', INSIDE);
      await feed('v-000001', OUTSIDE);
      await feed('v-000001', { speed: 150, ts: now });

      await waitFor(() => mockPg.alertInserts.length >= 2);

      const alertTypes = mockPg.alertInserts.map((p) => p[1]).sort();
      expect(alertTypes).toContain('geofence_exit');
      expect(alertTypes).toContain('speed_anomaly');
    });

    it('多辆车多告警都到达 PG', async () => {
      for (const id of ['v-000001', 'v-000002', 'v-000003']) {
        await feed(id, INSIDE);
      }
      for (const id of ['v-000001', 'v-000002', 'v-000003']) {
        await feed(id, OUTSIDE);
      }

      await waitFor(() => mockPg.alertInserts.length >= 3);

      const vehicleIds = new Set(mockPg.alertInserts.map((p) => p[0]));
      expect(vehicleIds.size).toBe(3);
    });
  });
});
