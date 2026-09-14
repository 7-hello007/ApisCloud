import { createLogger, resetConfig } from '@apiscloud/libs';
import { createGatewayServer, createRateLimitGuard } from '@apiscloud/gateway';

describe('gateway.rateLimit', () => {
  async function startGateway(opts: { enabled: boolean; max: number; windowSec: number }) {
    resetConfig();
    const logger = createLogger({ service: 'test', level: 'silent' });
    const rateLimitGuard = createRateLimitGuard({
      enabled: opts.enabled,
      maxRequests: opts.max,
      windowSec: opts.windowSec,
      exemptPaths: ['/health', '/metrics'],
      logger,
    });

    const server = createGatewayServer({
      port: 0,
      service: 'gateway-ratelimit-test',
      logger,
      proxyPrefix: '/api/proxy',
      proxiedServices: [],
      adminHandlers: {
        'GET /health': (_req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        },
        'GET /data': (_req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: true }));
        },
      },
      getPluginRoutes: () => [],
      guards: [rateLimitGuard],
    });

    await server.start();
    return server;
  }

  it('限流关闭时不过滤', async () => {
    const server = await startGateway({ enabled: false, max: 2, windowSec: 60 });
    try {
      for (let i = 0; i < 10; i++) {
        const res = await fetch(`http://localhost:${server.port()}/data`);
        expect(res.status).toBe(200);
      }
    } finally {
      await server.stop();
    }
  });

  it('限流开启时超过阈值返回 429', async () => {
    const server = await startGateway({ enabled: true, max: 3, windowSec: 60 });
    try {
      const results: number[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`http://localhost:${server.port()}/data`);
        results.push(res.status);
      }
      // 前 3 个 200，后 2 个 429
      expect(results.slice(0, 3)).toEqual([200, 200, 200]);
      expect(results.slice(3)).toEqual([429, 429]);
    } finally {
      await server.stop();
    }
  });

  it('429 响应带 retry_after_sec', async () => {
    const server = await startGateway({ enabled: true, max: 1, windowSec: 60 });
    try {
      await fetch(`http://localhost:${server.port()}/data`);
      const res = await fetch(`http://localhost:${server.port()}/data`);
      expect(res.status).toBe(429);
      const body = (await res.json()) as { error: string; retry_after_sec: number };
      expect(body.error).toBe('too_many_requests');
      expect(body.retry_after_sec).toBeGreaterThan(0);
    } finally {
      await server.stop();
    }
  });

  it('响应带 X-RateLimit 头', async () => {
    const server = await startGateway({ enabled: true, max: 5, windowSec: 60 });
    try {
      const res = await fetch(`http://localhost:${server.port()}/data`);
      expect(res.headers.get('x-ratelimit-limit')).toBe('5');
      expect(res.headers.get('x-ratelimit-remaining')).toBe('4');
      expect(res.headers.get('x-ratelimit-reset')).toBeTruthy();
    } finally {
      await server.stop();
    }
  });

  it('白名单路径不过限流', async () => {
    const server = await startGateway({ enabled: true, max: 1, windowSec: 60 });
    try {
      for (let i = 0; i < 10; i++) {
        const res = await fetch(`http://localhost:${server.port()}/health`);
        expect(res.status).toBe(200);
      }
    } finally {
      await server.stop();
    }
  });
});
