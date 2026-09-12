import type { LoadedPlugin, Plugin } from '@apiscloud/plugin-host';

export interface MakePluginOptions {
  name?: string;
  version?: string;
  core?: boolean;
  profile?: string[];
  lazy?: boolean;
  dependsOn?: string[];
  topics?: { subscribe?: string[]; publish?: string[] };
  instance?: Partial<Plugin>;
}

/**
 * 创建测试用 LoadedPlugin。
 */
export function makePlugin(options: MakePluginOptions = {}): LoadedPlugin {
  const name = options.name ?? 'test-plugin';
  return {
    manifest: {
      name,
      version: options.version ?? '1.0.0',
      core: options.core ?? false,
      profile: options.profile ?? ['test'],
      lazy: options.lazy ?? true,
      dependsOn: options.dependsOn ?? [],
      topics: {
        subscribe: options.topics?.subscribe ?? [],
        publish: options.topics?.publish ?? [],
      },
      routes: [],
      frontend: null,
    },
    instance: (options.instance ?? {}) as Plugin,
    path: `/fake/${name}`,
    loadedAt: Date.now(),
  };
}

/**
 * 创建测试用插件实例，所有钩子为 jest.fn。
 */
export function makePluginInstance(): Required<Plugin> {
  return {
    onLoad: jest.fn(),
    onUnload: jest.fn(),
    onMessage: jest.fn(),
    onTimer: jest.fn(),
    getRoutes: jest.fn(() => []),
    getHealth: jest.fn(() => ({ status: 'ok' as const })),
  };
}
