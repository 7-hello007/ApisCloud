import { loadConfig, resetConfig, ConfigSchema } from '@apiscloud/libs';

describe('libs.config', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('默认配置可用', () => {
    const config = loadConfig();
    expect(config.NODE_ENV).toBeDefined();
    expect(config.PG_PORT).toBeGreaterThan(0);
  });

  it('覆盖配置生效', () => {
    const config = loadConfig({ SERVICE_NAME: 'test-svc' });
    expect(config.SERVICE_NAME).toBe('test-svc');
  });

  it('非法 NODE_ENV 抛错', () => {
    expect(() => loadConfig({ NODE_ENV: 'invalid' as never })).toThrow();
  });

  it('schema 能独立校验', () => {
    const result = ConfigSchema.safeParse({ NODE_ENV: 'development' });
    expect(result.success).toBe(true);
  });
});
