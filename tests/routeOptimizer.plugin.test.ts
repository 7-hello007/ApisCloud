/* eslint-disable @typescript-eslint/no-require-imports */
import { loadConfig, resetConfig } from '@apiscloud/libs';
import { PluginHost, type LoadedPlugin } from '@apiscloud/plugin-host';
import { createEnvelope, MemoryAdapter, TOPICS } from '@apiscloud/message-bus';

import { waitFor } from './helpers';

const plugin = require('../plugins/route-optimizer/src/index.js');

function makeLoadedPlugin(): LoadedPlugin {
  return {
    manifest: {
      name: 'route-optimizer',
      version: '1.0.0',
      core: false,
      profile: ['test'],
      lazy: true,
      dependsOn: [],
      topics: {
        subscribe: [TOPICS.TELEMETRY_RAW],
        publish: [TOPICS.EVENTS_COMMANDS],
        filter: { field: 'status', equals: 'running' },
      },
      routes: [],
      frontend: null,
    },
    instance: plugin,
    path: '/fake/route-optimizer',
    loadedAt: Date.now(),
  };
}

function makeTelemetry(
  vehicleId: string,
  overrides: Partial<{
    status: string;
    speed: number;
  }> = {},
) {
  return {
    vehicle_id: vehicleId,
    ts: Date.now(),
    lat: 31.2304,
    lng: 121.4737,
    speed: overrides.speed ?? 10,
    battery: 80,
    heading: 90,
    status: overrides.status ?? 'running',
  };
}

describe('routeOptimizer.plugin（PluginHost 分发 + filter）', () => {
  let bus: MemoryAdapter;
  let host: PluginHost;
  let receivedCommands: Array<{
    vehicle_id: string;
    command_type: string;
    payload: { reason: string; current_speed: number };
  }>;

  beforeEach(async () => {
    resetConfig();
    plugin._reset();

    bus = new MemoryAdapter();
    await bus.connect();

    receivedCommands = [];
    await bus.subscribe(TOPICS.EVENTS_COMMANDS, async (env) => {
      receivedCommands.push(env.payload as never);
    });

    host = new PluginHost({ config: loadConfig(), bus });
    host.register(makeLoadedPlugin());
    await host.loadAll();
  });

  afterEach(async () => {
    await host.unloadAll();
    await bus.close();
    plugin._reset();
  });

  async function feed(vehicleId: string, overrides?: Parameters<typeof makeTelemetry>[1]) {
    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'simulator',
      payload: makeTelemetry(vehicleId, overrides),
    });
    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env);
  }

  it('filter 通过的低速车触发优化指令', async () => {
    await feed('v-000001', { status: 'running', speed: 10 });
    await waitFor(() => receivedCommands.length >= 1);

    expect(receivedCommands).toHaveLength(1);
    expect(receivedCommands[0].vehicle_id).toBe('v-000001');
    expect(receivedCommands[0].command_type).toBe('dispatch');
    expect(receivedCommands[0].payload.reason).toBe('route_optimize');
    expect(receivedCommands[0].payload.current_speed).toBe(10);
  });

  it('filter 不通过的消息不触发（idle）', async () => {
    await feed('v-000001', { status: 'idle', speed: 0 });
    await new Promise((r) => setTimeout(r, 100));
    expect(receivedCommands).toHaveLength(0);
  });

  it('running 但速度正常不触发', async () => {
    await feed('v-000001', { status: 'running', speed: 50 });
    await new Promise((r) => setTimeout(r, 100));
    expect(receivedCommands).toHaveLength(0);
  });

  it('冷却期内同一车不重复触发', async () => {
    await feed('v-000001', { status: 'running', speed: 10 });
    await waitFor(() => receivedCommands.length === 1);

    await feed('v-000001', { status: 'running', speed: 8 });
    await new Promise((r) => setTimeout(r, 100));
    expect(receivedCommands).toHaveLength(1);
  });

  it('不同车各自独立', async () => {
    await feed('v-000001', { status: 'running', speed: 10 });
    await feed('v-000002', { status: 'running', speed: 5 });
    await feed('v-000003', { status: 'running', speed: 12 });
    await waitFor(() => receivedCommands.length >= 3);

    const ids = new Set(receivedCommands.map((c) => c.vehicle_id));
    expect(ids.size).toBe(3);
  });

  it('命令 payload 结构正确', async () => {
    await feed('v-000001', { status: 'running', speed: 10 });
    await waitFor(() => receivedCommands.length >= 1);

    const cmd = receivedCommands[0] as unknown as {
      command_id: string;
      payload: {
        reason: string;
        optimization: string;
        current_speed: number;
        suggested_speed: number;
        issued_at: number;
      };
    };

    expect(cmd.command_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(cmd.payload.optimization).toBe('speed_boost');
    expect(cmd.payload.suggested_speed).toBe(40);
    expect(typeof cmd.payload.issued_at).toBe('number');
  });

  it('filter 直接拒绝 idle 车（在 dispatchMessage 层面拦截）', async () => {
    const onMessageSpy = jest.spyOn(plugin, 'onMessage');

    await feed('v-idle', { status: 'idle', speed: 0 });
    await new Promise((r) => setTimeout(r, 100));

    expect(onMessageSpy).not.toHaveBeenCalled();
    onMessageSpy.mockRestore();
  });

  it('filter 允许 running 车（在 dispatchMessage 层面通过）', async () => {
    const onMessageSpy = jest.spyOn(plugin, 'onMessage');

    await feed('v-run', { status: 'running', speed: 5 });
    await new Promise((r) => setTimeout(r, 100));

    expect(onMessageSpy).toHaveBeenCalledTimes(1);
    onMessageSpy.mockRestore();
  });
});
