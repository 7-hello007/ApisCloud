import {
  createLogger,
  type AppConfig,
  type HealthCheckResult,
  type HealthReport,
  type HealthState,
  type Logger,
} from '@apiscloud/libs';
import type { Envelope } from '@apiscloud/message-bus';

import { withTimeout } from './guard';
import { LifecycleManager } from './lifecycle';
import { PluginRegistry } from './registry';
import type { LoadedPlugin, PluginContext, Route } from './types';

export interface PluginHostOptions {
  config: AppConfig;
  logger?: Logger;
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

/**
 * 插件宿主。
 * 负责插件注册、生命周期、消息分发、定时调用、路由聚合、健康检查。
 */
export class PluginHost {
  private readonly config: AppConfig;
  private readonly logger: Logger;
  private readonly registry: PluginRegistry;
  private readonly lifecycle: LifecycleManager;
  private readonly messageTimeoutMs: number;
  private readonly timerTimeoutMs: number;
  private readonly startedAt: number;

  constructor(options: PluginHostOptions) {
    this.config = options.config;
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

  /** 注册已加载的插件 */
  register(loaded: LoadedPlugin): void {
    this.registry.register(loaded);
  }

  /** 加载所有插件，可按 profile 过滤 */
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

    this.logger.info(
      { loaded, failed, total: targets.length, profile: profile ?? 'all' },
      '插件加载完成',
    );

    return { loaded, failed, total: targets.length };
  }

  /** 卸载所有插件 */
  async unloadAll(): Promise<void> {
    const plugins = this.registry.list().slice().reverse();
    for (const plugin of plugins) {
      await this.lifecycle.unload(plugin);
    }
    this.logger.info({ count: plugins.length }, '插件卸载完成');
  }

  /** 分发消息给订阅了该主题的插件 */
  async dispatchMessage(topic: string, envelope: Envelope): Promise<void> {
    for (const { instance, manifest } of this.registry.list()) {
      if (!instance.onMessage) continue;

      const subscribed = manifest.topics?.subscribe ?? [];
      if (!subscribed.includes(topic)) continue;

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

  /** 分发定时调用给所有插件 */
  async dispatchTimer(): Promise<void> {
    for (const { instance, manifest } of this.registry.list()) {
      if (!instance.onTimer) continue;

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

  /** 聚合所有插件的路由 */
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

  /** 聚合健康检查 */
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

  /** 暴露注册表，便于测试和检查 */
  getRegistry(): PluginRegistry {
    return this.registry;
  }

  private buildContext(plugin: LoadedPlugin): PluginContext {
    return {
      pluginId: plugin.manifest.name,
      logger: this.logger.child({ plugin: plugin.manifest.name }),
      config: this.config,
    };
  }
}
