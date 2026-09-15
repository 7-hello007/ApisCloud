import { loadConfig, resetConfig } from '@apiscloud/libs';
import {
  PluginHost,
  type LoadedPlugin,
  type Plugin,
  type PluginMetrics,
} from '@apiscloud/plugin-host';
import { MemoryAdapter } from '@apiscloud/message-bus';

function makePlugin(name: string, instance: Partial<Plugin>): LoadedPlugin {
  return {
    manifest: {
      name,
      version: '1.0.0',
      core: false,
      profile: ['test'],
      lazy: true,
      dependsOn: [],
      topics: { subscribe: [], publish: [] },
      routes: [],
      frontend: null,
    },
    instance: instance as Plugin,
    path: `/fake/${name}`,
    loadedAt: Date.now(),
  };
}

function makeMetrics(): PluginMetrics & {
  readonly calls: { charging: number; geofence: number; anomaly: number };
} {
  const calls = { charging: 0, geofence: 0, anomaly: 0 };
  return {
    calls,
    chargingCommands: {
      inc() {
        calls.charging++;
      },
    },
    geofenceEvents: {
      inc() {
        calls.geofence++;
      },
    },
    anomalyEvents: {
      inc() {
        calls.anomaly++;
      },
    },
  };
}

describe('pluginHost.metricsInjection', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('onLoad 的 ctx 里有 metrics', async () => {
    const metrics = makeMetrics();
    const host = new PluginHost({
      config: loadConfig(),
      bus: new MemoryAdapter(),
      metrics,
    });

    let receivedMetrics: unknown = null;
    host.register(
      makePlugin('p1', {
        onLoad: (ctx) => {
          receivedMetrics = ctx.metrics;
        },
      }),
    );

    await host.loadAll();
    expect(receivedMetrics).toBe(metrics);
  });

  it('未提供 metrics 时 ctx.metrics 为 undefined', async () => {
    const host = new PluginHost({ config: loadConfig() });
    let receivedMetrics: unknown = 'init';

    host.register(
      makePlugin('p1', {
        onLoad: (ctx) => {
          receivedMetrics = ctx.metrics;
        },
      }),
    );

    await host.loadAll();
    expect(receivedMetrics).toBeUndefined();
  });

  it('插件通过 ctx.metrics 递增 chargingCommands', async () => {
    const metrics = makeMetrics();
    const host = new PluginHost({ config: loadConfig(), metrics });

    host.register(
      makePlugin('p1', {
        onLoad: (ctx) => {
          ctx.metrics!.chargingCommands.inc({
            command_type: 'charge',
            result: 'issued',
          });
          ctx.metrics!.chargingCommands.inc({
            command_type: 'charge',
            result: 'issued',
          });
        },
      }),
    );

    await host.loadAll();
    expect(metrics.calls.charging).toBe(2);
  });

  it('插件通过 ctx.metrics 递增 geofenceEvents', async () => {
    const metrics = makeMetrics();
    const host = new PluginHost({ config: loadConfig(), metrics });

    host.register(
      makePlugin('p1', {
        onLoad: (ctx) => {
          ctx.metrics!.geofenceEvents.inc({ event_type: 'exit', level: 'warning' });
        },
      }),
    );

    await host.loadAll();
    expect(metrics.calls.geofence).toBe(1);
  });

  it('插件通过 ctx.metrics 递增 anomalyEvents', async () => {
    const metrics = makeMetrics();
    const host = new PluginHost({ config: loadConfig(), metrics });

    host.register(
      makePlugin('p1', {
        onLoad: (ctx) => {
          ctx.metrics!.anomalyEvents.inc({
            alert_type: 'speed_anomaly',
            level: 'warning',
          });
        },
      }),
    );

    await host.loadAll();
    expect(metrics.calls.anomaly).toBe(1);
  });
});
