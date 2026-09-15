import { loadConfig, resetConfig } from '@apiscloud/libs';
import { PluginHost, type LoadedPlugin, type Plugin } from '@apiscloud/plugin-host';
import { createEnvelope, TOPICS } from '@apiscloud/message-bus';

function makePlugin(
  name: string,
  instance: Partial<Plugin>,
  filter?: { field: string; equals?: unknown; in?: unknown[] },
): LoadedPlugin {
  return {
    manifest: {
      name,
      version: '1.0.0',
      core: false,
      profile: ['test'],
      lazy: true,
      dependsOn: [],
      topics: {
        subscribe: [TOPICS.TELEMETRY_RAW],
        publish: [],
        filter,
      },
      routes: [],
      frontend: null,
    },
    instance: instance as Plugin,
    path: `/fake/${name}`,
    loadedAt: Date.now(),
  };
}

describe('pluginHost.filter', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('equals：匹配的消息触发 onMessage', async () => {
    const onMessage = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('p1', { onMessage }, { field: 'status', equals: 'running' }));
    await host.loadAll();

    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'test',
      payload: { status: 'running', speed: 30 },
    });
    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env);

    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('equals：不匹配的消息不触发', async () => {
    const onMessage = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('p1', { onMessage }, { field: 'status', equals: 'running' }));
    await host.loadAll();

    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'test',
      payload: { status: 'idle', speed: 0 },
    });
    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('in：匹配列表里的值触发', async () => {
    const onMessage = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('p1', { onMessage }, { field: 'status', in: ['running', 'idle'] }));
    await host.loadAll();

    const env1 = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'test',
      payload: { status: 'running' },
    });
    const env2 = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'test',
      payload: { status: 'idle' },
    });
    const env3 = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'test',
      payload: { status: 'offline' },
    });

    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env1);
    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env2);
    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env3);

    expect(onMessage).toHaveBeenCalledTimes(2);
  });

  it('点分路径：payload.position.lat', async () => {
    const onMessage = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('p1', { onMessage }, { field: 'position.status', equals: 'ok' }));
    await host.loadAll();

    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'test',
      payload: { position: { status: 'ok' } },
    });
    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env);
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('无 filter 时全部通过', async () => {
    const onMessage = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('p1', { onMessage }));
    await host.loadAll();

    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'test',
      payload: { status: 'whatever' },
    });
    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env);

    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('field 不存在时匹配失败', async () => {
    const onMessage = jest.fn();
    const host = new PluginHost({ config: loadConfig() });
    host.register(makePlugin('p1', { onMessage }, { field: 'status', equals: 'running' }));
    await host.loadAll();

    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'test',
      payload: { other: 'field' },
    });
    await host.dispatchMessage(TOPICS.TELEMETRY_RAW, env);

    expect(onMessage).not.toHaveBeenCalled();
  });
});
