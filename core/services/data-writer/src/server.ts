import http from 'node:http';

import type { HealthCheckResult, Logger, PgClient, RedisWrapper } from '@apiscloud/libs';
import type { ObservabilityMetrics } from '@apiscloud/observability';

import type { DataWriterConfig } from './types';
import {
  queryActiveVehicles,
  queryRecentAlerts,
  queryRecentCommands,
  queryVehicleById,
  type QueryContext,
} from './query';

export interface DataWriterServerOptions {
  port: number;
  service: string;
  logger: Logger;
  metrics: ObservabilityMetrics;
  redis: RedisWrapper;
  pg: PgClient;
  config: DataWriterConfig;
}

export interface DataWriterServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  port(): number;
}

export function createDataWriterServer(
  options: DataWriterServerOptions,
): DataWriterServer {
  const { port, service, logger, metrics, redis, pg, config } = options;

  let server: http.Server | null = null;
  let actualPort = port;

  const queryCtx: QueryContext = { redis, pg, limit: config.queryLimit };

  const handler = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> => {
    const start = Date.now();
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    const pathname = url.split('?')[0];

    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      // /health
      if (pathname === '/health' && method === 'GET') {
        const checks: Record<string, HealthCheckResult> = {};
        let overall: 'ok' | 'degraded' | 'down' = 'ok';

        checks.self = { status: 'ok', message: 'data-writer running' };

        try {
          checks.redis = await redis.health();
          if (checks.redis.status === 'down') overall = 'down';
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          checks.redis = { status: 'down', message };
          overall = 'down';
        }

        try {
          checks.pg = await pg.health();
          if (checks.pg.status === 'down') overall = 'down';
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          checks.pg = { status: 'down', message };
          overall = 'down';
        }

        const status = overall === 'down' ? 503 : 200;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: overall,
            service,
            timestamp: new Date().toISOString(),
            checks,
          }),
        );
        return;
      }

      // /metrics
      if (pathname === '/metrics' && method === 'GET') {
        const body = await metrics.registry.metrics();
        res.writeHead(200, { 'Content-Type': metrics.registry.contentType() });
        res.end(body);
        return;
      }

      // /api/query/vehicles/active
      if (pathname === '/api/query/vehicles/active' && method === 'GET') {
        const rows = await queryActiveVehicles(queryCtx);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ count: rows.length, vehicles: rows }));
        return;
      }

      // /api/query/vehicles/:id
      const vehicleMatch = pathname.match(/^\/api\/query\/vehicles\/([^/]+)$/);
      if (vehicleMatch && method === 'GET') {
        const vehicleId = decodeURIComponent(vehicleMatch[1]);
        const row = await queryVehicleById(queryCtx, vehicleId);
        if (!row) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not_found', vehicle_id: vehicleId }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(row));
        return;
      }

      // /api/query/alerts/recent
      if (pathname === '/api/query/alerts/recent' && method === 'GET') {
        const rows = await queryRecentAlerts(queryCtx);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ count: rows.length, alerts: rows }));
        return;
      }

      // /api/query/commands/recent
      if (pathname === '/api/query/commands/recent' && method === 'GET') {
        const rows = await queryRecentCommands(queryCtx);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ count: rows.length, commands: rows }));
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found', path: pathname }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ path: pathname, err: message }, '查询失败');
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
    } finally {
      const durationSec = (Date.now() - start) / 1000;
      metrics.httpRequests.inc({ method, path: pathname, status: '200' });
      metrics.httpDuration.observe({ method, path: pathname }, durationSec);
    }
  };

  return {
    async start() {
      await new Promise<void>((resolve, reject) => {
        server = http.createServer((req, res) => {
          void handler(req, res);
        });
        server.on('error', (err) => {
          logger.error({ err: err.message }, 'data-writer 服务器错误');
          reject(err);
        });
        server.listen(port, () => {
          const addr = server!.address();
          if (addr && typeof addr === 'object') actualPort = addr.port;
          logger.info({ port: actualPort, service }, 'data-writer HTTP 服务器已启动');
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
    },

    port() {
      return actualPort;
    },
  };
}
