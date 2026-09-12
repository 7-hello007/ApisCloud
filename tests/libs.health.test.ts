import { createHealthRegistry } from '@apiscloud/libs';

describe('libs.health', () => {
  it('空注册表返回 ok', async () => {
    const h = createHealthRegistry('test-svc');
    const r = await h.check();
    expect(r.status).toBe('ok');
    expect(r.service).toBe('test-svc');
    expect(r.checks).toEqual({});
  });

  it('注册 ok 检查', async () => {
    const h = createHealthRegistry('test-svc');
    h.register('db', async () => ({ status: 'ok' }));
    const r = await h.check();
    expect(r.status).toBe('ok');
    expect(r.checks.db.status).toBe('ok');
  });

  it('注册 down 检查，整体 down', async () => {
    const h = createHealthRegistry('test-svc');
    h.register('ok-check', async () => ({ status: 'ok' }));
    h.register('down-check', async () => ({ status: 'down', message: 'boom' }));
    const r = await h.check();
    expect(r.status).toBe('down');
    expect(r.checks['down-check'].message).toBe('boom');
  });

  it('检查项抛错，记为 down', async () => {
    const h = createHealthRegistry('test-svc');
    h.register('throw', async () => {
      throw new Error('exception');
    });
    const r = await h.check();
    expect(r.status).toBe('down');
    expect(r.checks.throw.message).toBe('exception');
  });
});
