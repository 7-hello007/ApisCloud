import { loadConfig, resetConfig } from '@apiscloud/libs';
import { PluginHost, type LoadedPlugin, type Plugin } from '@apiscloud/plugin-host';
import { createEnvelope, TOPICS } from '@apiscloud/message-bus';

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
      ...manifestOverrides,
    },
    instance: instance as Plugin,
    path: `/fake/${name}`,
    loadedAt: Date.now(),
  };
}

describe('pluginHost.host', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('注册 + loadAll 调用 onLoad', async () => {
    const onLoad = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('p1', { onLoad }));

    const result = await host.loadAll();
    expect(result.loaded).toBe(1);
    expect(result.failed).toBe(0);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('onLoad 抛错，不影响其他插件', async () => {
    const goodOnLoad = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(
      makePlugin('bad', {
        onLoad: async () => {
          throw new Error('boom');
        },
      }),
    );
    host.register(makePlugin('good', { onLoad: goodOnLoad }));

    const result = await host.loadAll();
    expect(result.loaded).toBe(1);
    expect(result.failed).toBe(1);
    expect(goodOnLoad).toHaveBeenCalled();
  });

  it('onLoad 超时被拦截', async () => {
    const host = new PluginHost({ config: loadConfig(), loadTimeoutMs: 50 });
    host.register(
      makePlugin('slow', {
        onLoad: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
        },
      }),
    );

    const result = await host.loadAll();
    expect(result.failed).toBe(1);
  });

  it('按 profile 过滤加载', async () => {
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('p1', {}, { profile: ['core'] }));
    host.register(makePlugin('p2', {}, { profile: ['full'] }));

    const result = await host.loadAll('core');
    expect(result.total).toBe(1);
    expect(result.loaded).toBe(1);
  });

  it('dispatchMessage 分发给订阅者', async () => {
    const onMessage = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(
      makePlugin('subscriber', { onMessage }, { topics: { subscribe: [TOPICS.TELEMETRY_RAW] } }),
    );

    await host.loadAll();
    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'test',
      payload: { a: 1 },
    });
    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(TOPICS.TELEMETRY_RAW, env);
  });

  it('未订阅的插件不收到消息', async () => {
    const onMessage = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(
      makePlugin('other', { onMessage }, { topics: { subscribe: [TOPICS.EVENTS_ALERTS] } }),
    );

    await host.loadAll();
    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'test',
      payload: {},
    });
    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('onMessage 抛错不影响其他插件', async () => {
    const goodHandler = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(
      makePlugin('bad', {
        onMessage: async () => {
          throw new Error('boom');
        },
      }),
    );
    host.register(makePlugin('good', { onMessage: goodHandler }));

    await host.loadAll();
    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'test',
      payload: {},
    });
    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env);

    expect(goodHandler).toHaveBeenCalled();
  });

  it('dispatchTimer 调用所有 onTimer', async () => {
    const onTimer = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('t1', { onTimer }));
    host.register(makePlugin('t2', { onTimer }));

    await host.loadAll();
    await host.dispatchTimer();

    expect(onTimer).toHaveBeenCalledTimes(2);
  });

  it('getRoutes 聚合所有路由', async () => {
    const host = new PluginHost({ config: loadConfig() });
    host.register(
      makePlugin('r1', {
        getRoutes: () => [
          { method: 'GET', path: '/r1/a', handler: () => undefined },
          { method: 'POST', path: '/r1/b', handler: () => undefined },
        ],
      }),
    );
    host.register(
      makePlugin('r2', {
        getRoutes: () => [{ method: 'GET', path: '/r2/a', handler: () => undefined }],
      }),
    );

    await host.loadAll();
    const routes = host.getRoutes();
    expect(routes).toHaveLength(3);
    expect(routes.map((r) => r.plugin).sort()).toEqual(['r1', 'r1', 'r2']);
  });

  it('health 聚合所有插件状态', async () => {
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('h1', { getHealth: async () => ({ status: 'ok' }) }));
    host.register(makePlugin('h2', { getHealth: async () => ({ status: 'down', message: 'oops' }) }));

    await host.loadAll();
    const report = await host.health();

    expect(report.status).toBe('down');
    expect(report.checks.h1.status).toBe('ok');
    expect(report.checks.h2.status).toBe('down');
    expect(report.service).toBe('plugin-host');
  });

  it('getHealth 抛错记为 down', async () => {
    const host = new PluginHost({ config: loadConfig() });
    host.register(
      makePlugin('h1', {
        getHealth: async () => {
          throw new Error('boom');
        },
      }),
    );

    await host.loadAll();
    const report = await host.health();
    expect(report.status).toBe('down');
    expect(report.checks.h1.message).toBe('boom');
  });

  it('unloadAll 调用 onUnload', async () => {
    const onUnload = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('p1', { onUnload }));

    await host.loadAll();
    await host.unloadAll();

    expect(onUnload).toHaveBeenCalledTimes(1);
  });
});
