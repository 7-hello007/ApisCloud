import { matchRoute, type RouterDeps } from '@apiscloud/gateway';
import type { PluginRouteEntry } from '@apiscloud/gateway';

function makeDeps(overrides: Partial<RouterDeps> = {}): RouterDeps {
  const adminHandlers = {
    'GET /health': () => undefined,
    'GET /metrics': () => undefined,
    'GET /api/registry': () => undefined,
  };

  const pluginRoutes: PluginRouteEntry[] = [
    {
      plugin: 'dashboard',
      route: {
        method: 'GET',
        path: '/api/dashboard/stats',
        handler: () => undefined,
      },
    },
  ];

  return {
    config: {
      port: 9101,
      pluginProfile: 'core',
      proxyPrefix: '/api/proxy',
      proxiedServices: [
        { name: 'ingest', target: 'http://localhost:9103' },
        { name: 'data-writer', target: 'http://localhost:9104' },
      ],
      pluginDirs: [],
    } as RouterDeps['config'],
    getPluginRoutes: () => pluginRoutes,
    adminHandlers,
    ...overrides,
  };
}

describe('gateway.router', () => {
  describe('管理端点', () => {
    it('匹配 GET /health', () => {
      const match = matchRoute('GET', '/health', makeDeps());
      expect(match.type).toBe('admin');
    });

    it('匹配 GET /metrics', () => {
      const match = matchRoute('GET', '/metrics', makeDeps());
      expect(match.type).toBe('admin');
    });

    it('匹配 GET /api/registry', () => {
      const match = matchRoute('GET', '/api/registry', makeDeps());
      expect(match.type).toBe('admin');
    });

    it('未注册的管理端点不匹配', () => {
      const match = matchRoute('POST', '/health', makeDeps());
      expect(match.type).not.toBe('admin');
    });
  });

  describe('反向代理', () => {
    it('匹配 /api/proxy/ingest/health', () => {
      const match = matchRoute('GET', '/api/proxy/ingest/health', makeDeps());
      expect(match.type).toBe('proxy');
      if (match.type === 'proxy') {
        expect(match.target).toBe('http://localhost:9103');
        expect(match.path).toBe('/health');
      }
    });

    it('匹配 /api/proxy/data-writer/api/query/vehicles', () => {
      const match = matchRoute(
        'GET',
        '/api/proxy/data-writer/api/query/vehicles',
        makeDeps(),
      );
      expect(match.type).toBe('proxy');
      if (match.type === 'proxy') {
        expect(match.target).toBe('http://localhost:9104');
        expect(match.path).toBe('/api/query/vehicles');
      }
    });

    it('匹配 /api/proxy/ingest（无尾斜杠，path 默认 /）', () => {
      const match = matchRoute('GET', '/api/proxy/ingest', makeDeps());
      expect(match.type).toBe('proxy');
      if (match.type === 'proxy') {
        expect(match.path).toBe('/');
      }
    });

    it('未知服务返回 not-found', () => {
      const match = matchRoute('GET', '/api/proxy/unknown/health', makeDeps());
      expect(match.type).toBe('not-found');
    });
  });

  describe('插件路由', () => {
    it('匹配已注册的插件路由', () => {
      const match = matchRoute('GET', '/api/dashboard/stats', makeDeps());
      expect(match.type).toBe('plugin');
      if (match.type === 'plugin') {
        expect(match.plugin).toBe('dashboard');
      }
    });

    it('未注册的插件路由不匹配', () => {
      const match = matchRoute('GET', '/api/dashboard/unknown', makeDeps());
      expect(match.type).toBe('not-found');
    });

    it('方法不匹配时不命中', () => {
      const match = matchRoute('POST', '/api/dashboard/stats', makeDeps());
      expect(match.type).toBe('not-found');
    });
  });

  describe('优先级', () => {
    it('管理端点优先于插件路由', () => {
      const pluginRoutes: PluginRouteEntry[] = [
        {
          plugin: 'fake',
          route: {
            method: 'GET',
            path: '/health',
            handler: () => undefined,
          },
        },
      ];
      const match = matchRoute(
        'GET',
        '/health',
        makeDeps({ getPluginRoutes: () => pluginRoutes }),
      );
      expect(match.type).toBe('admin');
    });

    it('代理前缀优先于插件路由', () => {
      const pluginRoutes: PluginRouteEntry[] = [
        {
          plugin: 'fake',
          route: {
            method: 'GET',
            path: '/api/proxy/ingest/x',
            handler: () => undefined,
          },
        },
      ];
      const match = matchRoute(
        'GET',
        '/api/proxy/ingest/x',
        makeDeps({ getPluginRoutes: () => pluginRoutes }),
      );
      expect(match.type).toBe('proxy');
    });
  });

  describe('404 兜底', () => {
    it('完全未知的路径返回 not-found', () => {
      const match = matchRoute('GET', '/not-exist', makeDeps());
      expect(match.type).toBe('not-found');
    });

    it('根路径 / 返回 not-found（除非插件注册了）', () => {
      const match = matchRoute('GET', '/', makeDeps());
      expect(match.type).toBe('not-found');
    });
  });
});
