import http from 'node:http';

/**
 * 反向代理请求到目标服务。
 * 透传 method、headers、body，回传 status、headers、body。
 */
export async function proxyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  target: string,
  path: string,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const url = new URL(target);

    const headers = { ...req.headers };
    // 覆盖 host，避免目标服务收到错误的 host
    headers.host = url.host;

    const options: http.RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path,
      method: req.method,
      headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
      proxyRes.on('end', resolve);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'bad_gateway',
          message: err.message,
          target,
        }),
      );
      resolve();
    });

    // 透传 body
    req.pipe(proxyReq);
  });
}
