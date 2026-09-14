import { createLogger, createJwt, resetConfig } from '@apiscloud/libs';
import { createGatewayServer } from '@apiscloud/gateway';
import { createAuthGuard } from '@apiscloud/gateway';

describe('gateway.auth', () => {
  const SECRET = 'test-secret-for-jwt-signing-32-chars-min';

  async function startGateway(authEnabled: boolean, jwtSecret = SECRET) {
    resetConfig();
    const logger = createLogger({ service: 'test', level: 'silent' });
    const authGuard = createAuthGuard({
      enabled: authEnabled,
      jwtSecret,
      publicPaths: ['/health', '/metrics', '/api/registry'],
      logger,
    });

    const server = createGatewayServer({
      port: 0,
      service: 'gateway-auth-test',
      logger,
      proxyPrefix: '/api/proxy',
      proxiedServices: [],
      adminHandlers: {
        'GET /health': (_req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        },
        'GET /protected': (_req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ secret: true }));
        },
      },
      getPluginRoutes: () => [],
      guards: [authGuard],
    });

    await server.start();
    return server;
  }

  it('auth 关闭时所有路径都通过', async () => {
    const server = await startGateway(false);
    try {
      const res = await fetch(`http://localhost:${server.port()}/protected`);
      expect(res.status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  it('auth 开启时白名单路径不校验', async () => {
    const server = await startGateway(true);
    try {
      const res = await fetch(`http://localhost:${server.port()}/health`);
      expect(res.status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  it('auth 开启时无 token 的受保护路径返回 401', async () => {
    const server = await startGateway(true);
    try {
      const res = await fetch(`http://localhost:${server.port()}/protected`);
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('unauthorized');
    } finally {
      await server.stop();
    }
  });

  it('auth 开启时有效 token 通过', async () => {
    const server = await startGateway(true);
    try {
      const jwt = createJwt({ secret: SECRET });
      const token = jwt.sign({ sub: 'user-1', role: 'admin' });

      const res = await fetch(`http://localhost:${server.port()}/protected`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { secret: boolean };
      expect(body.secret).toBe(true);
    } finally {
      await server.stop();
    }
  });

  it('auth 开启时无效 token 返回 401', async () => {
    const server = await startGateway(true);
    try {
      const res = await fetch(`http://localhost:${server.port()}/protected`, {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
    } finally {
      await server.stop();
    }
  });

  it('auth 开启时错误密钥签的 token 返回 401', async () => {
    const server = await startGateway(true);
    try {
      const wrongJwt = createJwt({ secret: 'wrong-secret-at-least-32-chars-long-xx' });
      const token = wrongJwt.sign({ sub: 'user-1' });

      const res = await fetch(`http://localhost:${server.port()}/protected`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(401);
    } finally {
      await server.stop();
    }
  });
});
