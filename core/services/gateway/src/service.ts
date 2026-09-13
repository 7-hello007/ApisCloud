import type { AppConfig, HealthCheckResult } from '@apiscloud/libs';
import {
  createMessageBus,
  type Envelope,
  type MessageBus,
  type Subscription,
} from '@apiscloud/message-bus';
import {
  createObservabilityService,
  type ObservabilityService,
} from '@apiscloud/observability';
import { PluginHost, type LoadedPlugin } from '@apiscloud/plugin-host';

import { loadGatewayConfig } from './config';
import { loadPluginsFromDirs } from './plugin-loader';
import { createGatewayServer, type GatewayServer } from './server';
import type { AdminHandler, GatewayConfig, PluginRouteEntry } from './types';

export interface GatewayServiceOptions {
  config: AppConfig;
  port: number;
  bus?: MessageBus;
  plugins?: LoadedPlugin[];
}

export interface GatewayService {
  readonly observability: ObservabilityService;
  readonly gatewayConfig: GatewayConfig;
  readonly pluginHost: PluginHost;
  port(): number;
  setPluginRoutes(routes: PluginRouteEntry[]): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * 创建 gateway 服务。
 * 组合：配置 + 总线 + 可观测性 + PluginHost + HTTP 服务器。
 */
export function createGatewayService(options: GatewayServiceOptions): GatewayService {
  const gwConfig = loadGatewayConfig(options.config);

  const observability = createObservabilityService({
    service: 'gateway',
    layer: options.config.LAYER,
    port: options.port,
    logLevel: options.config.LOG_LEVEL,
    prettyLogs: options.config.NODE_ENV === 'development',
  });

  const bus = options.bus ?? createMessageBus(options.config);

  const pluginHost = new PluginHost({
    config: options.config,
    logger: observability.logger,
    bus,
  });

  let plugins: LoadedPlugin[];
  if (options.plugins) {
    plugins = options.plugins;
  } else {
    const result = loadPluginsFromDirs({
      dirs: gwConfig.pluginDirs,
      logger: observability.logger,
    });
    plugins = result.plugins;
    if (result.errors.length > 0) {
      observability.logger.warn({ errors: result.errors }, '部分插件加载失败');
    }
  }

  for (const plugin of plugins) {
    pluginHost.register(plugin);
  }

  let pluginRoutes: PluginRouteEntry[] = [];

  const adminHandlers: Record<string, AdminHandler> = {};

  adminHandlers['GET /health'] = async (_req, res) => {
    const checks: Record<string, HealthCheckResult> = {};
    let overall: 'ok' | 'degraded' | 'down' = 'ok';

    checks.self = { status: 'ok', message: 'gateway running' };

    try {
      const busHealth = await bus.health();
      checks.bus = busHealth;
      if (busHealth.status === 'down') overall = 'down';
      else if (busHealth.status === 'degraded' && overall === 'ok') overall = 'degraded';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      checks.bus = { status: 'down', message };
      overall = 'down';
    }

    try {
      const hostHealth = await pluginHost.health();
      checks['plugin-host'] = {
        status: hostHealth.status,
        message: Object.keys(hostHealth.checks).join(','),
      };
      if (hostHealth.status === 'down') overall = 'down';
      else if (hostHealth.status === 'degraded' && overall === 'ok') overall = 'degraded';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      checks['plugin-host'] = { status: 'down', message };
      overall = 'down';
    }

    checks.proxiedServices = {
      status: 'ok',
      message: gwConfig.proxiedServices.map((s) => s.name).join(','),
    };

    const status = overall === 'down' ? 503 : 200;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: overall,
        service: 'gateway',
        timestamp: new Date().toISOString(),
        checks,
      }),
    );
  };

  adminHandlers['GET /metrics'] = async (_req, res) => {
    const body = await observability.metrics.registry.metrics();
    res.writeHead(200, { 'Content-Type': observability.metrics.registry.contentType() });
    res.end(body);
  };

  adminHandlers['GET /api/registry'] = async (_req, res) => {
    const loaded = pluginHost.getRegistry().list();
    const byProfile: Record<string, string[]> = {};
    for (const { manifest } of loaded) {
      for (const p of manifest.profile) {
        if (!byProfile[p]) byProfile[p] = [];
        byProfile[p].push(manifest.name);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        version: '1',
        profile: gwConfig.pluginProfile,
        proxiedServices: gwConfig.proxiedServices.map((s) => ({
          name: s.name,
          prefix: `${gwConfig.proxyPrefix}/${s.name}`,
        })),
        plugins: loaded.map(({ manifest }) => ({
          name: manifest.name,
          version: manifest.version,
          core: manifest.core,
          profile: manifest.profile,
          lazy: manifest.lazy,
          topics: manifest.topics ?? { subscribe: [], publish: [] },
          frontend: manifest.frontend ?? null,
          activated: pluginHost.isActivated(manifest.name),
        })),
        byProfile,
        subscribedTopics: pluginHost.getSubscribedTopics(),
      }),
    );
  };

  const server: GatewayServer = createGatewayServer({
    port: options.port,
    service: 'gateway',
    logger: observability.logger,
    proxyPrefix: gwConfig.proxyPrefix,
    proxiedServices: gwConfig.proxiedServices,
    adminHandlers,
    getPluginRoutes: () => pluginRoutes,
  });

  const subscriptions: Subscription[] = [];

  async function subscribeToPluginTopics(): Promise<void> {
    // 阶段五：用 getSubscribedTopics() 只拿已激活插件关心的主题
    const topics = pluginHost.getSubscribedTopics();

    for (const topic of topics) {
      const sub = await bus.subscribe(
        topic,
        async (env: Envelope) => {
          await pluginHost.dispatchMessage(topic, env);
        },
        { groupId: 'apiscloud-gateway' },
      );
      subscriptions.push(sub);
      observability.logger.debug({ topic }, 'gateway 订阅插件主题');
    }

    if (topics.length > 0) {
      observability.logger.info(
        { topics, consumerGroup: 'apiscloud-gateway' },
        'gateway 消息桥就绪（共享消费者组）',
      );
    }
  }

  return {
    observability,
    gatewayConfig: gwConfig,
    pluginHost,

    port() {
      return server.port();
    },

    setPluginRoutes(routes: PluginRouteEntry[]) {
      pluginRoutes = routes;
      observability.logger.info({ count: routes.length }, '插件路由已更新');
    },

    async start() {
      await bus.connect();

      const result = await pluginHost.loadAll(gwConfig.pluginProfile);
      observability.logger.info(
        { loaded: result.loaded, failed: result.failed, profile: gwConfig.pluginProfile },
        '插件加载完成',
      );

      pluginRoutes = pluginHost.getRoutes();

      await subscribeToPluginTopics();

      await server.start();

      observability.logger.info(
        {
          port: server.port(),
          proxyPrefix: gwConfig.proxyPrefix,
          proxiedServices: gwConfig.proxiedServices.map((s) => s.name),
          pluginsLoaded: result.loaded,
          pluginRoutes: pluginRoutes.length,
          subscribedTopics: pluginHost.getSubscribedTopics(),
        },
        'gateway 服务已启动',
      );
    },

    async stop() {
      for (const sub of subscriptions) {
        await sub.unsubscribe();
      }
      subscriptions.length = 0;

      await pluginHost.unloadAll();
      await server.stop();
      await bus.close();

      observability.logger.info('gateway 服务已停止');
    },
  };
}
