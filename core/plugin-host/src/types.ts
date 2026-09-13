import type { Logger } from '@apiscloud/libs';
import type {
  CreateEnvelopeOptions,
  Envelope,
  MessageBus,
  TopicName,
} from '@apiscloud/message-bus';

/** 插件接口：所有插件必须实现的方法（全部可选） */
export interface Plugin {
  onLoad?(ctx: PluginContext): Promise<void> | void;
  onUnload?(): Promise<void> | void;
  onMessage?(topic: string, envelope: Envelope): Promise<void> | void;
  onTimer?(): Promise<void> | void;
  getRoutes?(): Route[];
  getHealth?(): PluginHealth | Promise<PluginHealth>;
}

/** 插件上下文，onLoad 时注入 */
export interface PluginContext {
  pluginId: string;
  logger: Logger;
  /** 插件可通过此总线发布消息（阶段四新增，可选） */
  bus?: MessageBus;
  /** 创建标准信封（阶段四新增，可选） */
  createEnvelope?: <T>(options: CreateEnvelopeOptions<T>) => Envelope<T>;
  /** 消息总线主题常量（阶段四新增，可选） */
  topics?: {
    TELEMETRY_RAW: TopicName;
    TELEMETRY_AGGREGATED: TopicName;
    EVENTS_COMMANDS: TopicName;
    EVENTS_ALERTS: TopicName;
  };
  /** 插件可选的运行时依赖由外部注入 */
  [key: string]: unknown;
}

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: (req: unknown, res: unknown) => Promise<void> | void;
}

export interface PluginHealth {
  status: 'ok' | 'degraded' | 'down';
  message?: string;
}

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

export interface LoadedPlugin {
  manifest: PluginManifest;
  instance: Plugin;
  path: string;
  loadedAt: number;
}
