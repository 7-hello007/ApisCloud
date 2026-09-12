import { createJwt } from '@apiscloud/libs';

describe('security.jwt', () => {
  const secret = 'this-is-a-strong-secret-for-testing-1234';
  let jwt: ReturnType<typeof createJwt>;

  beforeEach(() => {
    jwt = createJwt({ secret });
  });

  it('签发和验证', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'admin' });
    const payload = jwt.verify(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('admin');
  });

  it('签发 refresh token', () => {
    const token = jwt.signRefresh({ sub: 'user-1' });
    const payload = jwt.verify(token);
    expect(payload.sub).toBe('user-1');
  });

  it('decode 不验证签名', () => {
    const token = jwt.sign({ sub: 'user-1' });
    const payload = jwt.decode(token);
    expect(payload?.sub).toBe('user-1');
  });

  it('非法 token 抛错', () => {
    expect(() => jwt.verify('invalid.token.here')).toThrow();
  });

  it('decode 非法 token 返回 null', () => {
    expect(jwt.decode('garbage')).toBeNull();
  });

  it('错误 secret 验证失败', () => {
    const token = jwt.sign({ sub: 'user-1' });
    const other = createJwt({ secret: 'another-secret-for-testing-5678' });
    expect(() => other.verify(token)).toThrow();
  });
});
