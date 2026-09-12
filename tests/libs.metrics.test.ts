import { createMetrics } from '@apiscloud/libs';

describe('libs.metrics', () => {
  it('创建 registry 并注册 counter', async () => {
    const m = createMetrics('test-svc');
    const c = m.counter('test_total', 'test counter', ['type']);
    c.inc({ type: 'a' });
    c.inc({ type: 'a' });
    const text = await m.metrics();
    expect(text).toContain('test_total');
    expect(text).toContain('service="test-svc"');
  });

  it('gauge 可设置', async () => {
    const m = createMetrics('test-svc');
    const g = m.gauge('test_gauge', 'test gauge');
    g.set(42);
    const text = await m.metrics();
    expect(text).toContain('test_gauge{service="test-svc"} 42');
  });

  it('histogram 可观察', async () => {
    const m = createMetrics('test-svc');
    const h = m.histogram('test_hist', 'test hist', [], [0.1, 0.5, 1]);
    h.observe(0.3);
    const text = await m.metrics();
    expect(text).toContain('test_hist_bucket');
  });
});
