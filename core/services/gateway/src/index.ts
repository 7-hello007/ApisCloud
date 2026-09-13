export const GATEWAY_VERSION = '0.1.0';

// 服务
export { createGatewayService } from './service';
export type { GatewayService, GatewayServiceOptions } from './service';

// 配置
export { loadGatewayConfig } from './config';

// 插件加载
export { loadPluginsFromDirs } from './plugin-loader';
export type { PluginLoaderOptions, PluginLoadResult } from './plugin-loader';

// 服务器
export { createGatewayServer } from './server';
export type { GatewayServer, GatewayServerOptions } from './server';

// 路由
export { matchRoute } from './router';
export type { RouterDeps } from './router';

// 代理
export { proxyRequest } from './proxy';

// 类型
export type {
  ProxiedService,
  PluginRouteEntry,
  GatewayConfig,
  RouteMatch,
  AdminHandler,
  PluginHandler,
} from './types';
