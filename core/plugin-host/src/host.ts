import {
  createLogger,
  type AppConfig,
  type HealthCheckResult,
  type HealthReport,
  type HealthState,
  type Logger,
} from '@apiscloud/libs';
import { createEnvelope, TOPICS, type Envelope, type MessageBus } from '@apiscloud/message-bus';

import { withTimeout } from './guard';
import { createHttpClient, type HttpClient } from './http-client';
import { LifecycleManager } from './lifecycle';
import { PluginRegistry } from './registry';
import type {
  LoadedPlugin,
  PluginContext,
  Route,
  ServiceUrls,
  TopicFilter,
} from './types';

export interface PluginHostOptions {
  config: AppConfig;
  logger?: Logger;
  bus?: MessageBus;
  services?: ServiceUrls;
  loadTimeoutMs?: number;
  unloadTimeoutMs?: number;
  messageTimeoutMs?: number;
  timerTimeoutMs?: number;
}

export interface LoadAllResult {
  loaded: number;
  failed: number;
  total: number;
}

export class PluginHost {
  private readonly config: AppConfig;
  private readonly logger: Logger;
  private readonly bus?: MessageBus;
  private readonly services?: ServiceUrls;
  private readonly http: HttpClient;
  private readonly registry: PluginRegistry;
  private readonly lifecycle: LifecycleManager;
  private readonly messageTimeoutMs: number;
  private readonly timerTimeoutMs: number;
  private readonly startedAt: number;
  /** 已激活的插件名（阶段五新增，用于懒订阅） */
  private readonly activated = new Set<string>();

  constructor(options: PluginHostOptions) {
    this.config = options.config;
    this.bus = options.bus;
    this.services = options.services ?? buildDefaultServices();
    this.http = createHttpClient();
    this.logger =
      options.logger ??
      createLogger({
        service: 'plugin-host',
        level: options.config.LOG_LEVEL,
        layer: options.config.LAYER,
      });
    this.registry = new PluginRegistry();
    this.lifecycle = new LifecycleManager(this.logger, {
      loadTimeoutMs: options.loadTimeoutMs,
      unloadTimeoutMs: options.unloadTimeoutMs,
    });
    this.messageTimeoutMs = options.messageTimeoutMs ?? 1000;
    this.timerTimeoutMs = options.timerTimeoutMs ?? 1000;
    this.startedAt = Date.now();
  }

  register(loaded: LoadedPlugin): void {
    this.registry.register(loaded);
  }

  async loadAll(profile?: string): Promise<LoadAllResult> {
    const targets = profile
      ? this.registry.filterByProfile(profile)
      : this.registry.list();

    let loaded = 0;
    let failed = 0;

    for (const plugin of targets) {
      const ctx = this.buildContext(plugin);
      const ok = await this.lifecycle.load(plugin, ctx);
      if (ok) loaded++;
      else failed++;
    }

    // 阶段五：懒订阅决策
    // - lazy: false 的插件始终激活
    // - lazy: true 且有订阅主题的插件激活（它必须订阅才能工作）
    // - lazy: true 且无订阅主题的插件不激活（如 dashboard，不占消费者名额）
    for (const plugin of targets) {
      const topics = plugin.manifest.topics?.subscribe ?? [];
      if (!plugin.manifest.lazy || topics.length > 0) {
        this.activated.add(plugin.manifest.name);
      }
    }

    this.logger.info(
      {
        loaded,
        failed,
        total: targets.length,
        profile: profile ?? 'all',
        activated: this.activated.size,
      },
      '插件加载完成',
    );

    return { loaded, failed, total: targets.length };
  }

  async unloadAll(): Promise<void> {
    const plugins = this.registry.list().slice().reverse();
    for (const plugin of plugins) {
      await this.lifecycle.unload(plugin);
    }
    this.activated.clear();
    this.logger.info({ count: plugins.length }, '插件卸载完成');
  }

  /** 阶段五：手动激活插件 */
  activatePlugin(name: string): boolean {
    const plugin = this.registry.get(name);
    if (!plugin) return false;
    this.activated.add(name);
    this.logger.info({ plugin: name }, '插件已激活');
    return true;
  }

  /** 阶段五：查询插件是否已激活 */
  isActivated(name: string): boolean {
    return this.activated.has(name);
  }

  /** 阶段五：返回所有已激活插件订阅的主题集合 */
  getSubscribedTopics(): string[] {
    const topics = new Set<string>();
    for (const { manifest } of this.registry.list()) {
      if (!this.activated.has(manifest.name)) continue;
      for (const t of manifest.topics?.subscribe ?? []) {
        topics.add(t);
      }
    }
    return Array.from(topics).sort();
  }

  async dispatchMessage(topic: string, envelope: Envelope): Promise<void> {
    for (const { instance, manifest } of this.registry.list()) {
      if (!instance.onMessage) continue;
      // 阶段五：未激活的插件不接收消息
      if (!this.activated.has(manifest.name)) continue;

      const subscribed = manifest.topics?.subscribe ?? [];
      if (!subscribed.includes(topic)) continue;

      const filter = manifest.topics?.filter;
      if (filter && !matchesFilter(envelope, filter)) continue;

      const label = `plugin:${manifest.name}:onMessage`;
      try {
        await withTimeout(
          () => Promise.resolve(instance.onMessage!(topic, envelope)),
          this.messageTimeoutMs,
          label,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          { plugin: manifest.name, topic, err: message },
          'onMessage 失败',
        );
      }
    }
  }

  async dispatchTimer(): Promise<void> {
    for (const { instance, manifest } of this.registry.list()) {
      if (!instance.onTimer) continue;
      if (!this.activated.has(manifest.name)) continue;

      const label = `plugin:${manifest.name}:onTimer`;
      try {
        await withTimeout(
          () => Promise.resolve(instance.onTimer!()),
          this.timerTimeoutMs,
          label,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error({ plugin: manifest.name, err: message }, 'onTimer 失败');
      }
    }
  }

  getRoutes(): Array<{ plugin: string; route: Route }> {
    const all: Array<{ plugin: string; route: Route }> = [];
    for (const { instance, manifest } of this.registry.list()) {
      if (!instance.getRoutes) continue;
      try {
        const routes = instance.getRoutes();
        for (const route of routes) {
          all.push({ plugin: manifest.name, route });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error({ plugin: manifest.name, err: message }, 'getRoutes 失败');
      }
    }
    return all;
  }

  async health(): Promise<HealthReport> {
    const checks: Record<string, HealthCheckResult> = {};
    let overall: HealthState = 'ok';

    for (const { instance, manifest } of this.registry.list()) {
      if (!instance.getHealth) {
        checks[manifest.name] = { status: 'ok' };
        continue;
      }

      try {
        const result = await instance.getHealth();
        checks[manifest.name] = {
          status: result.status,
          message: result.message,
        };
        if (result.status === 'down') overall = 'down';
        else if (result.status === 'degraded' && overall === 'ok') overall = 'degraded';
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        checks[manifest.name] = { status: 'down', message };
        overall = 'down';
      }
    }

    return {
      status: overall,
      service: 'plugin-host',
      timestamp: new Date().toISOString(),
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      checks,
    };
  }

  getRegistry(): PluginRegistry {
    return this.registry;
  }

  private buildContext(plugin: LoadedPlugin): PluginContext {
    return {
      pluginId: plugin.manifest.name,
      logger: this.logger.child({ plugin: plugin.manifest.name }),
      config: this.config,
      bus: this.bus,
      createEnvelope,
      topics: {
        TELEMETRY_RAW: TOPICS.TELEMETRY_RAW,
        TELEMETRY_AGGREGATED: TOPICS.TELEMETRY_AGGREGATED,
        EVENTS_COMMANDS: TOPICS.EVENTS_COMMANDS,
        EVENTS_ALERTS: TOPICS.EVENTS_ALERTS,
      },
      http: this.http,
      services: this.services,
    };
  }
}

function buildDefaultServices(): ServiceUrls {
  const dwPort = process.env.DATA_WRITER_PORT ?? '9104';
  const gwPort = process.env.GATEWAY_PORT ?? '9101';
  return {
    dataWriter: process.env.DATA_WRITER_URL ?? `http://localhost:${dwPort}`,
    gateway: process.env.GATEWAY_URL ?? `http://localhost:${gwPort}`,
  };
}

function matchesFilter(envelope: Envelope, filter: TopicFilter): boolean {
  const value = getField(envelope.payload, filter.field);

  if (filter.equals !== undefined) {
    return value === filter.equals;
  }
  if (filter.in !== undefined) {
    return filter.in.includes(value);
  }
  return true;
}

function getField(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
