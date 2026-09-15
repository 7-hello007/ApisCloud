import http from 'node:http';

import { createHttpClient } from '@apiscloud/plugin-host';

interface TestServer {
  server: http.Server;
  port: number;
  stop(): Promise<void>;
}

async function createTestServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<TestServer> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  return {
    server,
    port,
    async stop() {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

describe('pluginHost.httpClient', () => {
  describe('GET', () => {
    it('200 返回 JSON 对象', async () => {
      const srv = await createTestServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ hello: 'world', count: 42 }));
      });
      try {
        const client = createHttpClient();
        const result = await client.get<{ hello: string; count: number }>(
          `http://localhost:${srv.port}/api/test`,
        );
        expect(result.hello).toBe('world');
        expect(result.count).toBe(42);
      } finally {
        await srv.stop();
      }
    });

    it('200 返回非 JSON 时返回字符串', async () => {
      const srv = await createTestServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('plain text');
      });
      try {
        const client = createHttpClient();
        const result = await client.get<string>(`http://localhost:${srv.port}/text`);
        expect(result).toBe('plain text');
      } finally {
        await srv.stop();
      }
    });

    it('200 返回空 body 时返回 null', async () => {
      const srv = await createTestServer((_req, res) => {
        res.writeHead(200);
        res.end();
      });
      try {
        const client = createHttpClient();
        const result = await client.get<unknown>(`http://localhost:${srv.port}/empty`);
        expect(result).toBeNull();
      } finally {
        await srv.stop();
      }
    });
  });

  describe('POST', () => {
    it('发送 JSON body', async () => {
      let receivedBody = '';
      const srv = await createTestServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          receivedBody = body;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        });
      });
      try {
        const client = createHttpClient();
        const result = await client.post<{ ok: boolean }>(
          `http://localhost:${srv.port}/api/submit`,
          { name: 'test' },
        );
        expect(result.ok).toBe(true);
        expect(JSON.parse(receivedBody)).toEqual({ name: 'test' });
      } finally {
        await srv.stop();
      }
    });
  });

  describe('错误处理', () => {
    it('404 抛错带 status', async () => {
      const srv = await createTestServer((_req, res) => {
        res.writeHead(404);
        res.end('not found');
      });
      try {
        const client = createHttpClient();
        await expect(client.get(`http://localhost:${srv.port}/missing`)).rejects.toThrow(
          /HTTP 404/,
        );
      } finally {
        await srv.stop();
      }
    });

    it('500 抛错', async () => {
      const srv = await createTestServer((_req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'server error' }));
      });
      try {
        const client = createHttpClient();
        await expect(client.get(`http://localhost:${srv.port}/error`)).rejects.toThrow(/HTTP 500/);
      } finally {
        await srv.stop();
      }
    });

    it('连接不可达抛错', async () => {
      const client = createHttpClient({ timeoutMs: 500 });
      await expect(client.get('http://localhost:1/unreachable')).rejects.toThrow();
    });
  });

  describe('超时', () => {
    it('超过 timeoutMs 抛错', async () => {
      const srv = await createTestServer((_req, res) => {
        // 延迟 500ms 再响应
        setTimeout(() => {
          res.writeHead(200);
          res.end('late');
        }, 500);
      });
      try {
        const client = createHttpClient({ timeoutMs: 100 });
        await expect(client.get(`http://localhost:${srv.port}/slow`)).rejects.toThrow();
      } finally {
        await srv.stop();
      }
    });

    it('默认 10 秒超时不触发（快速响应）', async () => {
      const srv = await createTestServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ fast: true }));
      });
      try {
        const client = createHttpClient();
        const result = await client.get<{ fast: boolean }>(`http://localhost:${srv.port}/fast`);
        expect(result.fast).toBe(true);
      } finally {
        await srv.stop();
      }
    });
  });
});
