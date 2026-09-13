import type { Logger } from '@apiscloud/libs';
import type {
  CreateEnvelopeOptions,
  Envelope,
  MessageBus,
  TopicName,
} from '@apiscloud/message-bus';

import type { HttpClient } from './http-client';

export interface Plugin {
  onLoad?(ctx: PluginContext): Promise<void> | void;
  onUnload?(): Promise<void> | void;
  onMessage?(topic: string, envelope: Envelope): Promise<void> | void;
  onTimer?(): Promise<void> | void;
  getRoutes?(): Route[];
  getHealth?(): PluginHealth | Promise<PluginHealth>;
}

/** 服务 URL 清单（阶段五新增） */
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
  /** HTTP 客户端（阶段五新增） */
  http?: HttpClient;
  /** 服务 URL 清单（阶段五新增） */
  services?: ServiceUrls;
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
