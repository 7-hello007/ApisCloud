import { PluginRegistry, type LoadedPlugin, type Plugin } from '@apiscloud/plugin-host';

function makePlugin(name: string, overrides: Partial<LoadedPlugin['manifest']> = {}): LoadedPlugin {
  return {
    manifest: {
      name,
      version: '1.0.0',
      core: false,
      profile: ['core'],
      lazy: true,
      dependsOn: [],
      ...overrides,
    },
    instance: {} as Plugin,
    path: `/fake/${name}`,
    loadedAt: Date.now(),
  };
}

describe('pluginHost.registry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('注册和查找', () => {
    const p = makePlugin('plugin-a');
    registry.register(p);
    expect(registry.has('plugin-a')).toBe(true);
    expect(registry.get('plugin-a')).toBe(p);
    expect(registry.size()).toBe(1);
  });

  it('重复注册抛错', () => {
    registry.register(makePlugin('plugin-a'));
    expect(() => registry.register(makePlugin('plugin-a'))).toThrow(/已注册/);
  });

  it('unregister 移除', () => {
    registry.register(makePlugin('plugin-a'));
    expect(registry.unregister('plugin-a')).toBe(true);
    expect(registry.has('plugin-a')).toBe(false);
    expect(registry.unregister('non-existent')).toBe(false);
  });

  it('filterByProfile 过滤', () => {
    registry.register(makePlugin('a', { profile: ['core'] }));
    registry.register(makePlugin('b', { profile: ['full'] }));
    registry.register(makePlugin('c', { profile: ['core', 'full'] }));

    expect(
      registry
        .filterByProfile('core')
        .map((p) => p.manifest.name)
        .sort(),
    ).toEqual(['a', 'c']);
    expect(
      registry
        .filterByProfile('full')
        .map((p) => p.manifest.name)
        .sort(),
    ).toEqual(['b', 'c']);
  });

  it('filterByCore 过滤', () => {
    registry.register(makePlugin('a', { core: true }));
    registry.register(makePlugin('b', { core: false }));
    expect(registry.filterByCore(true).map((p) => p.manifest.name)).toEqual(['a']);
    expect(registry.filterByCore(false).map((p) => p.manifest.name)).toEqual(['b']);
  });

  it('clear 清空', () => {
    registry.register(makePlugin('a'));
    registry.register(makePlugin('b'));
    registry.clear();
    expect(registry.size()).toBe(0);
  });
});
