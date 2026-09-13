/* eslint-disable @typescript-eslint/no-require-imports */
import path from 'node:path';

import { loadConfig, resetConfig, type HealthCheckResult, type PgClient, type RedisWrapper } from '@apiscloud/libs';
import { createAggregatorService, type AggregatorService } from '@apiscloud/aggregator';
import { createDataWriterService, type DataWriterService } from '@apiscloud/data-writer';
import { PluginHost, type LoadedPlugin } from '@apiscloud/plugin-host';
import { createEnvelope, MemoryAdapter, TOPICS } from '@apiscloud/message-bus';

import { waitFor } from './helpers';

const PLUGINS_DIR = path.resolve(__dirname, '..', 'plugins');

// ============================================================
// Mock PG
// ============================================================

interface MockPg extends PgClient {
  readonly inserts: Array<{ sql: string; params?: unknown[] }>;
}

function createMockPg(): MockPg {
  const inserts: Array<{ sql: string; params?: unknown[] }> = [];
  return {
    inserts,
    async query(sql: string, params?: unknown[]) {
      inserts.push({ sql, params });
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
        smembers: async () => [],
        lpush: async () => 1,
        ltrim: async () => 'OK',
        lrange: async () => [],
      } as never;
    },
  } as RedisWrapper;
}

// ============================================================
// 加载插件
// ============================================================

const chargingScheduler = require(path.join(PLUGINS_DIR, 'charging-scheduler', 'src', 'index.js'));
const routeOptimizer = require(path.join(PLUGINS_DIR, 'route-optimizer', 'src', 'index.js'));

function makeLoadedPlugin(
  name: string,
  instance: unknown,
  subscribe: string[],
  filter?: { field: string; equals?: unknown },
): LoadedPlugin {
  return {
    manifest: {
      name,
      version: '1.0.0',
      core: false,
      profile: ['test'],
      lazy: true,
      dependsOn: [],
      topics: { subscribe, publish: [], filter },
      routes: [],
      frontend: null,
    },
    instance: instance as never,
    path: `/fake/${name}`,
    loadedAt: Date.now(),
  };
}

// ============================================================
// 测试
// ============================================================

describe('integration.pluginEcosystem', () => {
  let bus: MemoryAdapter;
  let aggregator: AggregatorService;
  let dataWriter: DataWriterService;
  let host: PluginHost;
  let mockPg: MockPg;
  let mockRedis: RedisWrapper;

  const receivedCommands: Array<{ vehicle_id: string; command_type: string }> = [];

  beforeEach(async () => {
    resetConfig();
    chargingScheduler._reset();
    routeOptimizer._reset();

    bus = new MemoryAdapter();
    mockPg = createMockPg();
    mockRedis = createMockRedis();

    // 订阅 events.commands 收集命令
    receivedCommands.length = 0;
    await bus.connect();
    await bus.subscribe(TOPICS.EVENTS_COMMANDS, async (env) => {
      receivedCommands.push(env.payload as never);
    });

    // 启动 aggregator
    aggregator = createAggregatorService({
      config: loadConfig({ SERVICE_NAME: 'aggregator' }),
      port: 0,
      bus,
    });
    // 手动注入 window 以便控制
    await aggregator.start();

    // 启动 data-writer
    dataWriter = createDataWriterService({
      config: loadConfig({ SERVICE_NAME: 'data-writer' }),
      port: 0,
      pg: mockPg,
      redis: mockRedis,
      bus,
    });
    await dataWriter.start();

    // 启动 PluginHost
    host = new PluginHost({ config: loadConfig(), bus });
    host.register(
      makeLoadedPlugin(
        'charging-scheduler',
        chargingScheduler,
        [TOPICS.TELEMETRY_AGGREGATED],
      ),
    );
    host.register(
      makeLoadedPlugin(
        'route-optimizer',
        routeOptimizer,
        [TOPICS.TELEMETRY_RAW],
        { field: 'status', equals: 'running' },
      ),
    );
    await host.loadAll();

    // 手动绑定 gateway 的消息桥
    await bus.subscribe(TOPICS.TELEMETRY_RAW, async (env) => {
      await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env);
    }, { groupId: 'apiscloud-gateway' });

    await bus.subscribe(TOPICS.TELEMETRY_AGGREGATED, async (env) => {
      await host.dispatchMessage(TOPICS.TELEMETRY_AGGREGATED, env);
    }, { groupId: 'apiscloud-gateway' });
  });

  afterEach(async () => {
    await host.unloadAll();
    await dataWriter.stop();
    await aggregator.stop();
    await bus.close();
    chargingScheduler._reset();
    routeOptimizer._reset();
  });

  function makeTelemetry(
    vehicleId: string,
    overrides: Partial<{
      speed: number;
      battery: number;
      status: string;
    }> = {},
  ) {
    return {
      vehicle_id: vehicleId,
      ts: Date.now(),
      lat: 31.2304,
      lng: 121.4737,
      speed: overrides.speed ?? 30,
      battery: overrides.battery ?? 80,
      heading: 90,
      status: overrides.status ?? 'running',
    };
  }

  async function publishRaw(vehicleId: string, overrides?: Parameters<typeof makeTelemetry>[1]) {
    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'simulator',
      payload: makeTelemetry(vehicleId, overrides),
    });
    await bus.publish(TOPICS.TELEMETRY_RAW, env, { partitionKey: vehicleId });
  }

  it('aggregator 从 raw 聚合出 aggregated', async () => {
    const received: unknown[] = [];
    await bus.subscribe(TOPICS.TELEMETRY_AGGREGATED, async (env) => {
      received.push(env.payload);
    });

    // 发 3 条遥测
    await publishRaw('v-1', { battery: 80 });
    await publishRaw('v-2', { battery: 10 });
    await publishRaw('v-3', { battery: 5 });

    // 手动 flush aggregator
    await aggregator.flush();

    await waitFor(() => received.length >= 1);

    const agg = received[0] as {
      vehicle_count: number;
      low_battery_vehicles: string[];
    };
    expect(agg.vehicle_count).toBe(3);
    expect(agg.low_battery_vehicles.sort()).toEqual(['v-2', 'v-3']);
  });

  it('charging-scheduler 收到 aggregated 后发 charge 命令', async () => {
    // 直接发一条 aggregated
    const aggPayload = {
      region: 'test',
      window_start: Date.now() - 5000,
      window_end: Date.now(),
      vehicle_count: 2,
      avg_speed: 30,
      avg_battery: 10,
      low_battery_vehicles: ['v-1', 'v-2'],
      idle_vehicles: [],
      region_center: { lat: 31.2304, lng: 121.4737 },
    };

    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_AGGREGATED,
      source: 'aggregator',
      payload: aggPayload,
    });
    await bus.publish(TOPICS.TELEMETRY_AGGREGATED, env, { partitionKey: 'test' });

    await waitFor(() => receivedCommands.length >= 2);

    const chargeCommands = receivedCommands.filter((c) => c.command_type === 'charge');
    expect(chargeCommands.length).toBe(2);
  });

  it('route-optimizer 收到低速 raw 后发 dispatch 命令', async () => {
    // 低速 running 车
    await publishRaw('v-slow', { status: 'running', speed: 5 });

    await waitFor(() => receivedCommands.length >= 1);

    const cmd = receivedCommands[0];
    expect(cmd.vehicle_id).toBe('v-slow');
    expect(cmd.command_type).toBe('dispatch');
  });

  it('route-optimizer 的 filter 拦截非 running 车', async () => {
    const beforeCount = receivedCommands.length;
    // idle 车
    await publishRaw('v-idle', { status: 'idle', speed: 0 });

    await new Promise((r) => setTimeout(r, 200));
    // route-optimizer 不处理 idle，且 aggregator 不发命令
    // charging-scheduler 只处理 aggregated 不处理 raw
    // 所以不应有新命令
    expect(receivedCommands.length).toBe(beforeCount);
  });

  it('完整链路：raw → aggregator → aggregated → charging-scheduler → commands → data-writer 审计', async () => {
    // 发 2 辆低电量车
    await publishRaw('v-low1', { battery: 10 });
    await publishRaw('v-low2', { battery: 5 });

    // 触发 aggregator
    await aggregator.flush();

    // 等 charging-scheduler 发命令
    await waitFor(() => receivedCommands.filter((c) => c.command_type === 'charge').length >= 2);

    // 等 data-writer 写审计
    await waitFor(
      () =>
        mockPg.inserts.filter((i) => i.sql.includes('INSERT INTO dispatch_commands')).length >=
        2,
    );

    const auditInserts = mockPg.inserts.filter((i) =>
      i.sql.includes('INSERT INTO dispatch_commands'),
    );
    expect(auditInserts.length).toBeGreaterThanOrEqual(2);
  });

  it('data-writer 写 telemetry.raw 到 PG', async () => {
    await publishRaw('v-000001', { battery: 80 });

    await waitFor(
      () => mockPg.inserts.filter((i) => i.sql.includes('vehicle_latest')).length >= 1,
    );

    const latestInsert = mockPg.inserts.find((i) => i.sql.includes('vehicle_latest'));
    expect(latestInsert).toBeDefined();
  });

  it('插件激活状态正确', () => {
    // charging-scheduler 订阅 aggregated，有订阅主题 → 激活
    expect(host.isActivated('charging-scheduler')).toBe(true);
    // route-optimizer 订阅 raw，有订阅主题 → 激活
    expect(host.isActivated('route-optimizer')).toBe(true);
  });

  it('getSubscribedTopics 返回两个插件的主题集合', () => {
    const topics = host.getSubscribedTopics();
    expect(topics).toContain(TOPICS.TELEMETRY_RAW);
    expect(topics).toContain(TOPICS.TELEMETRY_AGGREGATED);
  });
});
