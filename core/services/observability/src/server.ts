import http from 'node:http';

import type { Logger, HealthRegistry } from '@apiscloud/libs';

import type { ObservabilityMetrics } from './metrics';

export interface ServerOptions {
  port: number;
  service: string;
  logger: Logger;
  metrics: ObservabilityMetrics;
  health: HealthRegistry;
}

export interface ObservabilityServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  port(): number;
}

/**
 * 可观测性 HTTP 服务器。
 * 暴露两个端点：
 *   /metrics  Prometheus 格式
 *   /health   健康检查 JSON
 */
export function createServer(options: ServerOptions): ObservabilityServer {
  const { port, service, logger, metrics, health } = options;
  let server: http.Server | null = null;
  let actualPort = port;

  const handler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const start = Date.now();
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      if (url === '/metrics' && method === 'GET') {
        const body = await metrics.registry.metrics();
        res.writeHead(200, { 'Content-Type': metrics.registry.contentType() });
        res.end(body);
        recordMetrics(method, '/metrics', 200, start);
        return;
      }

      if (url === '/health' && method === 'GET') {
        const report = await health.check();
        const status = report.status === 'down' ? 503 : 200;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(report));
        recordMetrics(method, '/health', status, start);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found', path: url }));
      recordMetrics(method, 'unknown', 404, start);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ path: url, err: message }, '请求处理失败');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
      recordMetrics(method, url, 500, start);
    }
  };

  function recordMetrics(method: string, path: string, status: number, startMs: number) {
    const durationSec = (Date.now() - startMs) / 1000;
    metrics.httpRequests.inc({ method, path, status: String(status) });
    metrics.httpDuration.observe({ method, path }, durationSec);
  }

  return {
    async start() {
      await new Promise<void>((resolve, reject) => {
        server = http.createServer((req, res) => {
          void handler(req, res);
        });

        server.on('error', (err) => {
          logger.error({ err: err.message }, '可观测性服务器错误');
          reject(err);
        });

        server.listen(port, () => {
          const addr = server!.address();
          if (addr && typeof addr === 'object') {
            actualPort = addr.port;
          }
          logger.info({ port: actualPort, service }, '可观测性服务已启动');
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
      logger.info('可观测性服务已停止');
    },

    port() {
      return actualPort;
    },
  };
}
