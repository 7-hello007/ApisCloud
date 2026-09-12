import { createSecurity, loadConfig, resetConfig, z } from '@apiscloud/libs';

describe('libs.security', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('JWT 签发与验证', () => {
    const config = loadConfig({ JWT_SECRET: 'this-is-a-test-secret' });
    const sec = createSecurity(config);
    const token = sec.signJwt({ sub: 'user-1', role: 'admin' });
    const payload = sec.verifyJwt(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('admin');
  });

  it('非法 JWT 抛错', () => {
    const config = loadConfig({ JWT_SECRET: 'this-is-a-test-secret' });
    const sec = createSecurity(config);
    expect(() => sec.verifyJwt('invalid.token.here')).toThrow();
  });

  it('zod 校验通过', () => {
    const config = loadConfig();
    const sec = createSecurity(config);
    const schema = z.object({ name: z.string(), age: z.number().int() });
    const r = sec.validate(schema, { name: 'a', age: 1 });
    expect(r).toEqual({ name: 'a', age: 1 });
  });

  it('zod 校验失败抛错', () => {
    const config = loadConfig();
    const sec = createSecurity(config);
    const schema = z.object({ name: z.string() });
    expect(() => sec.validate(schema, { name: 123 })).toThrow();
  });
});
