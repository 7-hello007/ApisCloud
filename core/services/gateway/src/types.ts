import type { Route } from '@apiscloud/plugin-host';

export interface ProxiedService {
  name: string;
  target: string;
}

export interface PluginRouteEntry {
  plugin: string;
  route: Route;
}

export interface GatewayConfig {
  port: number;
  pluginProfile: string;
  proxyPrefix: string;
  proxiedServices: ProxiedService[];
  pluginDirs: string[];
  registryPath?: string;
  /** 是否开启 JWT 认证（阶段六新增） */
  authEnabled: boolean;
  /** JWT secret */
  jwtSecret: string;
  /** 无需认证的路径前缀 */
  authPublicPaths: string[];
  /** 是否开启限流（阶段六新增） */
  rateLimitEnabled: boolean;
  /** 每个时间窗内每 IP 最大请求数 */
  rateLimitMax: number;
  /** 时间窗秒数 */
  rateLimitWindowSec: number;
}

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
