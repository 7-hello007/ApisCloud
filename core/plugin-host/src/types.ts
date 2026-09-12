import type { Logger } from '@apiscloud/libs';
import type { Envelope } from '@apiscloud/message-bus';

/** 插件接口：所有插件必须实现的方法（全部可选） */
export interface Plugin {
  /** 加载时调用 */
  onLoad?(ctx: PluginContext): Promise<void> | void;
  /** 卸载时调用 */
  onUnload?(): Promise<void> | void;
  /** 收到消息时调用 */
  onMessage?(topic: string, envelope: Envelope): Promise<void> | void;
  /** 定时调用 */
  onTimer?(): Promise<void> | void;
  /** 暴露 HTTP 路由 */
  getRoutes?(): Route[];
  /** 健康检查 */
  getHealth?(): Promise<PluginHealth> | PluginHealth;
}

/** 插件上下文，onLoad 时注入 */
export interface PluginContext {
  pluginId: string;
  logger: Logger;
  /** 插件可选的运行时依赖由外部注入，避免直接 import 核心 */
  [key: string]: unknown;
}

/** HTTP 路由声明 */
export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: (req: unknown, res: unknown) => Promise<void> | void;
}

/** 插件健康检查结果 */
export interface PluginHealth {
  status: 'ok' | 'degraded' | 'down';
  message?: string;
}

/** plugin.json 结构 */
export interface PluginManifest {
  name: string;
  version: string;
  core: boolean;
  profile: string[];
  lazy: boolean;
  dependsOn: string[];
  topics?: {
    subscribe?: string[];
    publish?: string[];
  };
  routes?: string[];
  frontend?: string | null;
}

/** 已加载的插件 */
export interface LoadedPlugin {
  manifest: PluginManifest;
  instance: Plugin;
  path: string;
  loadedAt: number;
}
