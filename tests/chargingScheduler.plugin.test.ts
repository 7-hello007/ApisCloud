/* eslint-disable @typescript-eslint/no-require-imports */
import { loadConfig, resetConfig } from '@apiscloud/libs';
import { PluginHost, type LoadedPlugin } from '@apiscloud/plugin-host';
import { createEnvelope, MemoryAdapter, TOPICS } from '@apiscloud/message-bus';

import { waitFor } from './helpers';

const plugin = require('../plugins/charging-scheduler/src/index.js');

function makeLoadedPlugin(): LoadedPlugin {
  return {
    manifest: {
      name: 'charging-scheduler',
      version: '1.0.0',
      core: false,
      profile: ['test'],
      lazy: true,
      dependsOn: [],
      topics: {
        subscribe: [TOPICS.TELEMETRY_AGGREGATED],
        publish: [TOPICS.EVENTS_COMMANDS],
      },
      routes: [],
      frontend: null,
    },
    instance: plugin,
    path: '/fake/charging-scheduler',
    loadedAt: Date.now(),
  };
}

interface AggregatedPayload {
  region: string;
  window_start: number;
  window_end: number;
  vehicle_count: number;
  avg_speed: number;
  avg_battery: number;
  low_battery_vehicles: string[];
  idle_vehicles: string[];
  region_center: { lat: number; lng: number };
}

function makeAggregated(
  lowBatteryVehicles: string[] = [],
  overrides: Partial<AggregatedPayload> = {},
): AggregatedPayload {
  return {
    region: 'test',
    window_start: Date.now() - 5000,
    window_end: Date.now(),
    vehicle_count: lowBatteryVehicles.length,
    avg_speed: 30,
    avg_battery: 15,
    low_battery_vehicles: lowBatteryVehicles,
    idle_vehicles: [],
    region_center: { lat: 31.2304, lng: 121.4737 },
    ...overrides,
  };
}

describe('chargingScheduler.plugin（PluginHost 分发）', () => {
  let bus: MemoryAdapter;
  let host: PluginHost;
  let receivedCommands: Array<{ vehicle_id: string; command_id: string; command_type: string }>;

  beforeEach(async () => {
    resetConfig();
    plugin._reset();

    bus = new MemoryAdapter();
    await bus.connect();

    receivedCommands = [];
    await bus.subscribe(TOPICS.EVENTS_COMMANDS, async (env) => {
      receivedCommands.push(env.payload as never);
    });

    host = new PluginHost({
      config: loadConfig(),
      bus,
    });
    host.register(makeLoadedPlugin());
    await host.loadAll();
  });

  afterEach(async () => {
    await host.unloadAll();
    await bus.close();
    plugin._reset();
  });

  function makeAggregatedEnvelope(payload: AggregatedPayload) {
    return createEnvelope({
      topic: TOPICS.TELEMETRY_AGGREGATED,
      source: 'aggregator',
      payload,
    });
  }

  it('插件加载后从 ctx 拿到 bus 和 helpers', () => {
    const config = plugin._getConfig();
    expect(config.lowBatteryThreshold).toBe(20);
    expect(config.cooldownMs).toBe(5 * 60 * 1000);
  });

  it('收到无低电量车辆的聚合消息，不发指令', async () => {
    const env = makeAggregatedEnvelope(makeAggregated([]));
    await host.dispatchMessage(TOPICS.TELEMETRY_AGGREGATED, env);

    await new Promise((r) => setTimeout(r, 100));
    expect(receivedCommands).toHaveLength(0);
  });

  it('收到有低电量车辆的聚合消息，为每辆车发一条指令', async () => {
    const env = makeAggregatedEnvelope(makeAggregated(['v-000001', 'v-000002']));
    await host.dispatchMessage(TOPICS.TELEMETRY_AGGREGATED, env);

    await waitFor(() => receivedCommands.length >= 2);

    expect(receivedCommands).toHaveLength(2);
    const vehicleIds = receivedCommands.map((c) => c.vehicle_id).sort();
    expect(vehicleIds).toEqual(['v-000001', 'v-000002']);
    expect(receivedCommands[0].command_type).toBe('charge');
  });

  it('同一车在冷却期内不重复发指令', async () => {
    // 第一次
    await host.dispatchMessage(
      TOPICS.TELEMETRY_AGGREGATED,
      makeAggregatedEnvelope(makeAggregated(['v-000001'])),
    );
    await waitFor(() => receivedCommands.length === 1);

    // 第二次，同一车
    await host.dispatchMessage(
      TOPICS.TELEMETRY_AGGREGATED,
      makeAggregatedEnvelope(makeAggregated(['v-000001'])),
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(receivedCommands).toHaveLength(1);
  });

  it('冷却期后重新发指令', async () => {
    // 手动改 cooldown 为 0，让同一车立刻重新可发
    plugin._getRecentCommands().clear();

    // 第一次
    await host.dispatchMessage(
      TOPICS.TELEMETRY_AGGREGATED,
      makeAggregatedEnvelope(makeAggregated(['v-000001'])),
    );
    await waitFor(() => receivedCommands.length === 1);

    // 清空冷却记录（模拟过期）
    plugin._getRecentCommands().clear();

    // 第二次
    await host.dispatchMessage(
      TOPICS.TELEMETRY_AGGREGATED,
      makeAggregatedEnvelope(makeAggregated(['v-000001'])),
    );
    await waitFor(() => receivedCommands.length === 2);

    expect(receivedCommands).toHaveLength(2);
  });

  it('多车多指令，vehicle_id 各自独立', async () => {
    const env = makeAggregatedEnvelope(
      makeAggregated(['v-000001', 'v-000002', 'v-000003']),
    );
    await host.dispatchMessage(TOPICS.TELEMETRY_AGGREGATED, env);

    await waitFor(() => receivedCommands.length >= 3);

    const ids = new Set(receivedCommands.map((c) => c.vehicle_id));
    expect(ids.size).toBe(3);
  });

  it('命令 payload 结构正确', async () => {
    await host.dispatchMessage(
      TOPICS.TELEMETRY_AGGREGATED,
      makeAggregatedEnvelope(makeAggregated(['v-000001'])),
    );
    await waitFor(() => receivedCommands.length >= 1);

    const cmd = receivedCommands[0] as unknown as {
      vehicle_id: string;
      command_id: string;
      command_type: string;
      payload: { reason: string; threshold: number; issued_at: number };
    };

    expect(cmd.command_type).toBe('charge');
    expect(cmd.payload.reason).toBe('low_battery');
    expect(cmd.payload.threshold).toBe(20);
    expect(typeof cmd.payload.issued_at).toBe('number');
  });

  it('未订阅的主题不触发', async () => {
    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'test',
      payload: { some: 'data' },
    });
    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env);

    await new Promise((r) => setTimeout(r, 100));
    expect(receivedCommands).toHaveLength(0);
  });
});
