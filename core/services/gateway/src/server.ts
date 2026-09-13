import http from 'node:http';

import type { Logger } from '@apiscloud/libs';

import { proxyRequest } from './proxy';
import { matchRoute, type RouterDeps } from './router';
import type { AdminHandler, PluginRouteEntry } from './types';

export interface GatewayServerOptions {
  port: number;
  service: string;
  logger: Logger;
  proxyPrefix: string;
  proxiedServices: Array<{ name: string; target: string }>;
  /** 管理端点处理器，key = 'METHOD /path' */
  adminHandlers: Record<string, AdminHandler>;
  /** 当前插件路由（可运行时更新） */
  getPluginRoutes: () => PluginRouteEntry[];
}

export interface GatewayServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  port(): number;
}

/**
 * gateway HTTP 服务器。
 * 处理请求，匹配路由，分派到管理端点 / 代理 / 插件路由。
 */
export function createGatewayServer(options: GatewayServerOptions): GatewayServer {
  const {
    port,
    service,
    logger,
    proxyPrefix,
    proxiedServices,
    adminHandlers,
    getPluginRoutes,
  } = options;

  let server: http.Server | null = null;
  let actualPort = port;

  const routerDeps: RouterDeps = {
    config: { proxyPrefix, proxiedServices } as RouterDeps['config'],
    getPluginRoutes,
    adminHandlers,
  };

  const handler = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> => {
    const start = Date.now();
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    const pathname = url.split('?')[0];

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const match = matchRoute(method, pathname, routerDeps);

      if (match.type === 'admin') {
        await Promise.resolve(match.handler(req, res));
        logger.debug({ method, path: pathname, durationMs: Date.now() - start }, 'admin');
        return;
      }

      if (match.type === 'proxy') {
        await proxyRequest(req, res, match.target, match.path);
        logger.debug(
          { method, path: pathname, target: match.target, durationMs: Date.now() - start },
          'proxy',
        );
        return;
      }

      if (match.type === 'plugin') {
        await Promise.resolve(match.handler(req, res));
        logger.debug(
          { method, path: pathname, plugin: match.plugin, durationMs: Date.now() - start },
          'plugin',
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found', path: pathname }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ path: pathname, err: message }, '请求处理失败');
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
    }
  };

  return {
    async start() {
      await new Promise<void>((resolve, reject) => {
        server = http.createServer((req, res) => {
          void handler(req, res);
        });

        server.on('error', (err) => {
          logger.error({ err: err.message }, 'gateway 服务器错误');
          reject(err);
        });

        server.listen(port, () => {
          const addr = server!.address();
          if (addr && typeof addr === 'object') {
            actualPort = addr.port;
          }
          logger.info({ port: actualPort, service }, 'gateway 已启动');
          resolve();
        });
      });
    },

    async stop() {
      if (!server) return;
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
      logger.info('gateway 已停止');
    },

    port() {
      return actualPort;
    },
  };
}
