import { loadConfig, resetConfig } from '@apiscloud/libs';
import { PluginHost, type LoadedPlugin, type Plugin } from '@apiscloud/plugin-host';
import { createEnvelope, MemoryAdapter, TOPICS } from '@apiscloud/message-bus';

function makePlugin(
  name: string,
  instance: Partial<Plugin> = {},
  manifestOverrides: Partial<LoadedPlugin['manifest']> = {},
): LoadedPlugin {
  return {
    manifest: {
      name,
      version: '1.0.0',
      core: false,
      profile: ['test'],
      lazy: true,
      dependsOn: [],
      topics: { subscribe: [TOPICS.TELEMETRY_RAW], publish: [] },
      routes: [],
      frontend: null,
      ...manifestOverrides,
    },
    instance: instance as Plugin,
    path: `/fake/${name}`,
    loadedAt: Date.now(),
  };
}

describe('pluginHost.busInjection', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('onLoad 的 ctx 里有 bus', async () => {
    const bus = new MemoryAdapter();
    await bus.connect();

    const host = new PluginHost({ config: loadConfig(), bus });
    let receivedBus: unknown = null;

    host.register(
      makePlugin('p1', {
        onLoad: (ctx) => {
          receivedBus = ctx.bus;
        },
      }),
    );

    await host.loadAll();
    expect(receivedBus).toBe(bus);
  });

  it('未提供 bus 时 ctx.bus 为 undefined', async () => {
    const host = new PluginHost({ config: loadConfig() });
    let receivedBus: unknown = 'init';

    host.register(
      makePlugin('p1', {
        onLoad: (ctx) => {
          receivedBus = ctx.bus;
        },
      }),
    );

    await host.loadAll();
    expect(receivedBus).toBeUndefined();
  });

  it('插件可通过 ctx.bus 发布消息', async () => {
    const bus = new MemoryAdapter();
    await bus.connect();

    const received: unknown[] = [];
    await bus.subscribe(TOPICS.EVENTS_ALERTS, async (env) => {
      received.push(env.payload);
    });

    const host = new PluginHost({ config: loadConfig(), bus });
    host.register(
      makePlugin('publisher', {
        onLoad: async (ctx) => {
          const env = createEnvelope({
            topic: TOPICS.EVENTS_ALERTS,
            source: 'publisher',
            payload: { hello: 'world' },
          });
          await ctx.bus!.publish(TOPICS.EVENTS_ALERTS, env);
        },
      }),
    );

    await host.loadAll();
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ hello: 'world' });
  });
});
