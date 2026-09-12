import { createSecrets } from '@apiscloud/libs';

describe('security.secrets', () => {
  it('get 存在的密钥', () => {
    const secrets = createSecrets({ reader: () => 'value' });
    expect(secrets.get('ANY')).toBe('value');
  });

  it('get 不存在的密钥抛错', () => {
    const secrets = createSecrets({ reader: () => undefined });
    expect(() => secrets.get('MISSING')).toThrow(/不存在/);
  });

  it('getOptional 不存在返回 undefined', () => {
    const secrets = createSecrets({ reader: () => undefined });
    expect(secrets.getOptional('OPT')).toBeUndefined();
  });

  it('前缀生效', () => {
    const store: Record<string, string> = { PREFIX_KEY: 'value' };
    const secrets = createSecrets({ prefix: 'PREFIX_', reader: (n) => store[n] });
    expect(secrets.get('KEY')).toBe('value');
  });

  it('弱 JWT_SECRET 拒绝', () => {
    const secrets = createSecrets({ reader: () => 'short' });
    expect(() => secrets.requireStrongJwtSecret()).toThrow(/长度不足/);
  });

  it('默认值 JWT_SECRET 拒绝', () => {
    const secrets = createSecrets({
      reader: (n) => (n === 'JWT_SECRET' ? 'change-me-in-production' : undefined),
    });
    expect(() => secrets.requireStrongJwtSecret()).toThrow(/默认值/);
  });

  it('强 JWT_SECRET 通过', () => {
    const strong = 'a'.repeat(32);
    const secrets = createSecrets({
      reader: (n) => (n === 'JWT_SECRET' ? strong : undefined),
    });
    expect(secrets.requireStrongJwtSecret()).toBe(strong);
  });
});
