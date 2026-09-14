import type { Logger } from '@apiscloud/libs';
import type {
  CreateEnvelopeOptions,
  Envelope,
  MessageBus,
  TopicName,
} from '@apiscloud/message-bus';

/**
 * 插件可用的指标子集（结构兼容 ObservabilityMetrics）。
 * 只暴露 3 个业务指标，插件不需要知道全部。
 */
export interface PluginMetrics {
  chargingCommands: { inc(labels: { command_type: string; result: string }): void };
  geofenceEvents: { inc(labels: { event_type: string; level: string }): void };
  anomalyEvents: { inc(labels: { alert_type: string; level: string }): void };
}

export interface Plugin {
  onLoad?(ctx: PluginContext): Promise<void> | void;
  onUnload?(): Promise<void> | void;
  onMessage?(topic: string, envelope: Envelope): Promise<void> | void;
  onTimer?(): Promise<void> | void;
  getRoutes?(): Route[];
  getHealth?(): PluginHealth | Promise<PluginHealth>;
}

export interface ServiceUrls {
  dataWriter?: string;
  gateway?: string;
}

export interface PluginContext {
  pluginId: string;
  logger: Logger;
  bus?: MessageBus;
  createEnvelope?: <T>(options: CreateEnvelopeOptions<T>) => Envelope<T>;
  topics?: {
    TELEMETRY_RAW: TopicName;
    TELEMETRY_AGGREGATED: TopicName;
    EVENTS_COMMANDS: TopicName;
    EVENTS_ALERTS: TopicName;
  };
  http?: unknown;
  services?: ServiceUrls;
  /** 插件可用的业务指标（阶段六第三批新增） */
  metrics?: PluginMetrics;
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

export interface TopicFilter {
  field: string;
  equals?: unknown;
  in?: unknown[];
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
    filter?: TopicFilter;
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
