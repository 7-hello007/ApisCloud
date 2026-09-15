import { loadConfig, resetConfig } from '@apiscloud/libs';
import { PluginHost, type LoadedPlugin, type Plugin } from '@apiscloud/plugin-host';
import { createEnvelope, TOPICS } from '@apiscloud/message-bus';

function makePlugin(
  name: string,
  options: {
    lazy?: boolean;
    subscribe?: string[];
    instance?: Partial<Plugin>;
  } = {},
): LoadedPlugin {
  return {
    manifest: {
      name,
      version: '1.0.0',
      core: false,
      profile: ['test'],
      lazy: options.lazy ?? true,
      dependsOn: [],
      topics: {
        subscribe: options.subscribe ?? [],
        publish: [],
      },
      routes: [],
      frontend: null,
    },
    instance: (options.instance ?? {}) as Plugin,
    path: `/fake/${name}`,
    loadedAt: Date.now(),
  };
}

describe('pluginHost.lazySubscription', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('lazy=true 且无订阅主题的插件不激活', async () => {
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('dashboard', { lazy: true, subscribe: [] }));
    await host.loadAll();

    expect(host.isActivated('dashboard')).toBe(false);
  });

  it('lazy=true 但有订阅主题的插件激活', async () => {
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('geofence', { lazy: true, subscribe: [TOPICS.TELEMETRY_RAW] }));
    await host.loadAll();

    expect(host.isActivated('geofence')).toBe(true);
  });

  it('lazy=false 的插件始终激活', async () => {
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('always-on', { lazy: false, subscribe: [] }));
    await host.loadAll();

    expect(host.isActivated('always-on')).toBe(true);
  });

  it('getSubscribedTopics 只返回已激活插件的主题', async () => {
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('a', { lazy: true, subscribe: [TOPICS.TELEMETRY_RAW] }));
    host.register(makePlugin('b', { lazy: true, subscribe: [TOPICS.TELEMETRY_AGGREGATED] }));
    host.register(makePlugin('c', { lazy: true, subscribe: [TOPICS.TELEMETRY_AGGREGATED] }));
    await host.loadAll();

    const topics = host.getSubscribedTopics();
    expect(topics).toEqual([TOPICS.TELEMETRY_AGGREGATED, TOPICS.TELEMETRY_RAW].sort());
  });

  it('未激活的插件不接收消息', async () => {
    const onMessage = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(
      makePlugin('idle-plugin', {
        lazy: true,
        subscribe: [],
        instance: { onMessage },
      }),
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

  it('activatePlugin 能手动激活', async () => {
    const onMessage = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(
      makePlugin('idle-plugin', {
        lazy: true,
        subscribe: [TOPICS.TELEMETRY_RAW],
        instance: { onMessage },
      }),
    );

    // 手动设为不激活场景：把 subscribe 清空
    // 用一个 lazy=true 且 subscribe 为空的插件测试 activatePlugin
    const host2 = new PluginHost({ config: loadConfig() });
    host2.register(makePlugin('lazy-one', { lazy: true, subscribe: [] }));
    await host2.loadAll();
    expect(host2.isActivated('lazy-one')).toBe(false);

    // 手动激活
    const ok = host2.activatePlugin('lazy-one');
    expect(ok).toBe(true);
    expect(host2.isActivated('lazy-one')).toBe(true);
  });

  it('activatePlugin 未知插件返回 false', async () => {
    const host = new PluginHost({ config: loadConfig() });
    await host.loadAll();

    expect(host.activatePlugin('not-exist')).toBe(false);
  });

  it('unloadAll 后 activated 集合清空', async () => {
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('p1', { lazy: false }));
    await host.loadAll();
    expect(host.isActivated('p1')).toBe(true);

    await host.unloadAll();
    expect(host.isActivated('p1')).toBe(false);
  });

  it('lazy=false 的插件即使无订阅主题也被激活', async () => {
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('reporting', { lazy: false, subscribe: [] }));
    await host.loadAll();

    expect(host.isActivated('reporting')).toBe(true);
    expect(host.getSubscribedTopics()).toEqual([]);
  });
});
