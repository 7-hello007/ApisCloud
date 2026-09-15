import http from 'node:http';

import { resetConfig } from '@apiscloud/libs';
import { createGatewayServer, type GatewayServer } from '@apiscloud/gateway';
import { createLogger } from '@apiscloud/libs';

/**
 * 起一个 mock target server，接收任何请求，返回固定 JSON。
 */
interface MockTarget {
  server: http.Server;
  port: number;
  received: Array<{
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
    body: string;
  }>;
  stop(): Promise<void>;
}

async function createMockTarget(): Promise<MockTarget> {
  const received: MockTarget['received'] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      received.push({
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        headers: req.headers,
        body,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, from: 'mock-target' }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  return {
    server,
    port,
    received,
    async stop() {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

describe('gateway.proxy', () => {
  let target: MockTarget;
  let gateway: GatewayServer;

  beforeEach(async () => {
    resetConfig();
    target = await createMockTarget();

    const logger = createLogger({ service: 'test', level: 'silent' });
    gateway = createGatewayServer({
      port: 0,
      service: 'gateway-test',
      logger,
      proxyPrefix: '/api/proxy',
      proxiedServices: [{ name: 'mock-svc', target: `http://localhost:${target.port}` }],
      adminHandlers: {},
      getPluginRoutes: () => [],
    });
    await gateway.start();
  });

  afterEach(async () => {
    await gateway.stop();
    await target.stop();
  });

  it('GET 请求透传到 target', async () => {
    const res = await fetch(`http://localhost:${gateway.port()}/api/proxy/mock-svc/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; from: string };
    expect(body.ok).toBe(true);
    expect(body.from).toBe('mock-target');

    expect(target.received).toHaveLength(1);
    expect(target.received[0].method).toBe('GET');
    expect(target.received[0].url).toBe('/health');
  });

  it('POST 请求带 body 透传', async () => {
    const res = await fetch(`http://localhost:${gateway.port()}/api/proxy/mock-svc/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    expect(res.status).toBe(200);

    expect(target.received).toHaveLength(1);
    expect(target.received[0].method).toBe('POST');
    expect(target.received[0].url).toBe('/api/submit');
    expect(target.received[0].body).toBe('{"hello":"world"}');
  });

  it('多层路径透传', async () => {
    await fetch(
      `http://localhost:${gateway.port()}/api/proxy/mock-svc/api/query/vehicles/active?limit=10`,
    );
    expect(target.received[0].url).toBe('/api/query/vehicles/active?limit=10');
  });

  it('目标服务不可达时返回 502', async () => {
    // 停掉 target
    await target.stop();

    const res = await fetch(`http://localhost:${gateway.port()}/api/proxy/mock-svc/health`);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('bad_gateway');
  });

  it('未知服务名返回 404', async () => {
    const res = await fetch(`http://localhost:${gateway.port()}/api/proxy/unknown/health`);
    expect(res.status).toBe(404);
  });

  it('自定义 headers 透传', async () => {
    await fetch(`http://localhost:${gateway.port()}/api/proxy/mock-svc/health`, {
      headers: { 'X-Custom': 'test-value', 'X-Trace': 'trace-123' },
    });
    expect(target.received[0].headers['x-custom']).toBe('test-value');
    expect(target.received[0].headers['x-trace']).toBe('trace-123');
  });
});
