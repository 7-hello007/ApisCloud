import type { IncomingMessage } from 'node:http';

import { createAuthMiddleware, createJwt } from '@apiscloud/libs';

function makeReq(headers: Record<string, string> = {}, url = '/'): IncomingMessage {
  return {
    headers,
    url,
  } as IncomingMessage;
}

describe('security.auth', () => {
  const jwt = createJwt({ secret: 'this-is-a-strong-secret-for-testing-1234' });
  const middleware = createAuthMiddleware({ jwt, publicPaths: ['/health', '/public'] });

  it('公开路径直接通过', () => {
    const req = makeReq({}, '/health');
    const result = middleware.guard(req);
    expect(result.ok).toBe(true);
  });

  it('缺少 token 拒绝', () => {
    const req = makeReq({}, '/api/data');
    const result = middleware.guard(req);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('缺少认证 token');
  });

  it('合法 token 通过', () => {
    const token = jwt.sign({ sub: 'user-1' });
    const req = makeReq({ authorization: `Bearer ${token}` }, '/api/data');
    const result = middleware.guard(req);
    expect(result.ok).toBe(true);
    expect(result.user?.sub).toBe('user-1');
  });

  it('非法 token 拒绝', () => {
    const req = makeReq({ authorization: 'Bearer invalid' }, '/api/data');
    const result = middleware.guard(req);
    expect(result.ok).toBe(false);
  });

  it('非 Bearer 格式拒绝', () => {
    const token = jwt.sign({ sub: 'user-1' });
    const req = makeReq({ authorization: `Basic ${token}` }, '/api/data');
    const result = middleware.guard(req);
    expect(result.ok).toBe(false);
  });
});
