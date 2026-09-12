import http from 'node:http';

import { createObservabilityService, newTraceContext, withTrace } from '@apiscloud/observability';
import { createLogger, resetConfig } from '@apiscloud/libs';

describe('observability.collect', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('服务可启动并可访问 /metrics', async () => {
    const svc = createObservabilityService({
      service: 'test-obs',
      port: 0,
      logLevel: 'silent',
      logger: createLogger({ service: 'test-obs', level: 'silent' }),
    });

    await svc.start();
    const port = svc.port;

    const body = await httpGet(`http://localhost:${port}/metrics`);
    expect(body.status).toBe(200);
    expect(body.body).toContain('apiscloud_http_requests_total');

    await svc.stop();
  });

  it('服务可访问 /health', async () => {
    const svc = createObservabilityService({
      service: 'test-obs',
      port: 0,
      logLevel: 'silent',
      logger: createLogger({ service: 'test-obs', level: 'silent' }),
    });

    await svc.start();
    const port = svc.port;

    const body = await httpGet(`http://localhost:${port}/health`);
    expect(body.status).toBe(200);
    const parsed = JSON.parse(body.body);
    expect(parsed.status).toBe('ok');
    expect(parsed.service).toBe('test-obs');
    expect(parsed.checks.self).toBeDefined();

    await svc.stop();
  });

  it('注册额外健康检查项', async () => {
    const svc = createObservabilityService({
      service: 'test-obs',
      port: 0,
      logLevel: 'silent',
      logger: createLogger({ service: 'test-obs', level: 'silent' }),
    });

    svc.addHealthTarget({
      name: 'pg',
      check: async () => ({ status: 'ok', message: 'pg reachable' }),
    });

    await svc.start();
    const port = svc.port;

    const body = await httpGet(`http://localhost:${port}/health`);
    const parsed = JSON.parse(body.body);
    expect(parsed.checks.pg.status).toBe('ok');
    expect(parsed.checks.pg.message).toBe('pg reachable');

    await svc.stop();
  });

  it('down 检查让 /health 返回 503', async () => {
    const svc = createObservabilityService({
      service: 'test-obs',
      port: 0,
      logLevel: 'silent',
      logger: createLogger({ service: 'test-obs', level: 'silent' }),
    });

    svc.addHealthTarget({
      name: 'mqtt',
      check: async () => ({ status: 'down', message: 'disconnected' }),
    });

    await svc.start();
    const port = svc.port;

    const body = await httpGet(`http://localhost:${port}/health`);
    expect(body.status).toBe(503);

    await svc.stop();
  });

  it('/metrics 包含自定义指标', async () => {
    const svc = createObservabilityService({
      service: 'test-obs',
      port: 0,
      logLevel: 'silent',
      logger: createLogger({ service: 'test-obs', level: 'silent' }),
    });

    svc.metrics.dataFlowMessages.inc({ topic: 'telemetry.raw', direction: 'in' });

    await svc.start();
    const port = svc.port;

    const body = await httpGet(`http://localhost:${port}/metrics`);
    expect(body.body).toContain('apiscloud_dataflow_messages_total');
    expect(body.body).toContain('topic="telemetry.raw"');

    await svc.stop();
  });

  it('未知路径返回 404', async () => {
    const svc = createObservabilityService({
      service: 'test-obs',
      port: 0,
      logLevel: 'silent',
      logger: createLogger({ service: 'test-obs', level: 'silent' }),
    });

    await svc.start();
    const port = svc.port;

    const body = await httpGet(`http://localhost:${port}/unknown`);
    expect(body.status).toBe(404);

    await svc.stop();
  });

  it('tracer 可开始和结束 span', () => {
    const logger = createLogger({ service: 'test-obs', level: 'silent' });
    const svc = createObservabilityService({
      service: 'test-obs',
      port: 0,
      logger,
    });

    const span = svc.tracer.startSpan('test-op');
    expect(span.trace_id).toBeDefined();
    expect(span.span_id).toBeDefined();
    expect(svc.tracer.activeSpans()).toHaveLength(1);

    svc.tracer.endSpan(span.span_id, { result: 'ok' });
    expect(svc.tracer.activeSpans()).toHaveLength(0);
  });

  it('withTrace 绑定 trace_id 和 span_id', () => {
    const logger = createLogger({ service: 'test-obs', level: 'silent' });
    const ctx = newTraceContext();
    expect(ctx.trace_id).toHaveLength(32);
    expect(ctx.span_id).toHaveLength(16);

    const child = withTrace(logger, ctx);
    expect(child).toBeDefined();
  });
});

/**
 * 简易 HTTP GET
 */
function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: data });
        });
      })
      .on('error', reject);
  });
}
