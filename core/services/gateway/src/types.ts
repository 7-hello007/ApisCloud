import type { Route } from '@apiscloud/plugin-host';

/**
 * 反向代理目标服务。
 */
export interface ProxiedService {
  name: string;
  target: string;
}

/**
 * 插件路由条目。
 * 从 PluginHost 聚合而来。
 */
export interface PluginRouteEntry {
  plugin: string;
  route: Route;
}

/**
 * gateway 运行配置。
 */
export interface GatewayConfig {
  /** HTTP 端口，默认 9101 */
  port: number;
  /** 加载插件的 profile，默认 core */
  pluginProfile: string;
  /** 反向代理前缀，默认 /api/proxy */
  proxyPrefix: string;
  /** 被代理的服务清单 */
  proxiedServices: ProxiedService[];
  /** 插件扫描目录 */
  pluginDirs: string[];
  /** registry.json 路径（可选覆盖） */
  registryPath?: string;
}

/**
 * 路由匹配结果。
 */
export type RouteMatch =
  | { type: 'admin'; handler: AdminHandler }
  | { type: 'plugin'; plugin: string; handler: PluginHandler }
  | { type: 'proxy'; target: string; path: string }
  | { type: 'not-found' };

export type AdminHandler = (
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
) => Promise<void> | void;

export type PluginHandler = (
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
) => Promise<void> | void;
