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
  /** 可注入的 MessageBus（测试用） */
  bus?: MessageBus;
  /** 可注入的插件列表（测试用；不传则从 pluginDirs 扫描） */
  plugins?: LoadedPlugin[];
}

export interface GatewayService {
  readonly observability: ObservabilityService;
  readonly gatewayConfig: GatewayConfig;
  readonly pluginHost: PluginHost;
  /** gateway HTTP 服务器的实际端口（端口为 0 时返回系统分配的端口） */
  port(): number;
  /** 手动覆盖插件路由（一般不用） */
  setPluginRoutes(routes: PluginRouteEntry[]): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * 创建 gateway 服务。
 * 组合：配置 + 总线 + 可观测性 + PluginHost + HTTP 服务器。
 *
 * 注意：gateway 不启动 observability 自带的 HTTP 服务器，
 * 只复用其 logger / metrics / health registry，HTTP 服务器由 gateway 自己的 server 承担。
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

  // ============================================================
  // PluginHost
  // ============================================================

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

  // ============================================================
  // 管理端点
  // ============================================================

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
        })),
        byProfile,
      }),
    );
  };

  // ============================================================
  // HTTP 服务器
  // ============================================================

  const server: GatewayServer = createGatewayServer({
    port: options.port,
    service: 'gateway',
    logger: observability.logger,
    proxyPrefix: gwConfig.proxyPrefix,
    proxiedServices: gwConfig.proxiedServices,
    adminHandlers,
    getPluginRoutes: () => pluginRoutes,
  });

  // ============================================================
  // 消息桥：订阅插件主题，转发给 PluginHost
  // ============================================================

  const subscriptions: Subscription[] = [];

  async function subscribeToPluginTopics(): Promise<void> {
    const topics = new Set<string>();
    for (const { manifest } of pluginHost.getRegistry().list()) {
      for (const t of manifest.topics?.subscribe ?? []) {
        topics.add(t);
      }
    }

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

    if (topics.size > 0) {
      observability.logger.info({ topics: Array.from(topics) }, 'gateway 消息桥就绪');
    }
  }

  // ============================================================
  // 生命周期
  // ============================================================

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
      // 不启动 observability 的 HTTP 服务器；只复用其 logger/metrics/health
      // await observability.start();  ← 移除

      // 1. 加载插件
      const result = await pluginHost.loadAll(gwConfig.pluginProfile);
      observability.logger.info(
        { loaded: result.loaded, failed: result.failed, profile: gwConfig.pluginProfile },
        '插件加载完成',
      );

      // 2. 聚合插件路由
      pluginRoutes = pluginHost.getRoutes();

      // 3. 订阅插件主题
      await subscribeToPluginTopics();

      // 4. 启动 gateway 自己的 HTTP 服务器
      await server.start();

      observability.logger.info(
        {
          port: server.port(),
          proxyPrefix: gwConfig.proxyPrefix,
          proxiedServices: gwConfig.proxiedServices.map((s) => s.name),
          pluginsLoaded: result.loaded,
          pluginRoutes: pluginRoutes.length,
        },
        'gateway 服务已启动',
      );
    },

    async stop() {
      // 1. 取消总线订阅
      for (const sub of subscriptions) {
        await sub.unsubscribe();
      }
      subscriptions.length = 0;

      // 2. 卸载插件
      await pluginHost.unloadAll();

      // 3. 停止 HTTP 服务器
      await server.stop();

      // 4. 关闭总线
      await bus.close();

      // 不调用 observability.stop()（未启动其 server）
      observability.logger.info('gateway 服务已停止');
    },
  };
}
