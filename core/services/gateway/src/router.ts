import type { AdminHandler, GatewayConfig, PluginRouteEntry, RouteMatch } from './types';

export interface RouterDeps {
  config: GatewayConfig;
  /** 当前插件路由（可能运行时更新） */
  getPluginRoutes: () => PluginRouteEntry[];
  /** 管理端点处理器 */
  adminHandlers: Record<string, AdminHandler>;
}

/**
 * 匹配请求。
 * 优先级：
 *   1. 管理端点（/health、/metrics、/api/registry）
 *   2. 反向代理前缀（/api/proxy/{service}/*）
 *   3. 插件路由（精确匹配）
 *   4. 404
 */
export function matchRoute(method: string, pathname: string, deps: RouterDeps): RouteMatch {
  const { config, getPluginRoutes, adminHandlers } = deps;

  // 1. 管理端点
  const adminKey = `${method} ${pathname}`;
  if (adminHandlers[adminKey]) {
    return { type: 'admin', handler: adminHandlers[adminKey] };
  }

  // 2. 反向代理：/api/proxy/{service}/{rest}
  const proxyPrefix = config.proxyPrefix;
  if (pathname.startsWith(`${proxyPrefix}/`)) {
    const rest = pathname.slice(proxyPrefix.length + 1);
    const slashIdx = rest.indexOf('/');
    const serviceName = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    const servicePath = slashIdx === -1 ? '/' : rest.slice(slashIdx);

    const service = config.proxiedServices.find((s) => s.name === serviceName);
    if (service) {
      return {
        type: 'proxy',
        target: service.target,
        path: servicePath,
      };
    }
    return { type: 'not-found' };
  }

  // 3. 插件路由：精确匹配（method + path）
  for (const { plugin, route } of getPluginRoutes()) {
    if (route.method === method && route.path === pathname) {
      return {
        type: 'plugin',
        plugin,
        handler: route.handler as (
          req: import('node:http').IncomingMessage,
          res: import('node:http').ServerResponse,
        ) => Promise<void> | void,
      };
    }
  }

  // 4. 404
  return { type: 'not-found' };
}
