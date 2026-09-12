import {
  createEnvelope,
  parseEnvelope,
  serializeEnvelope,
  validateEnvelope,
} from '@apiscloud/message-bus';

describe('messageBus.envelope', () => {
  it('createEnvelope 生成完整信封', () => {
    const env = createEnvelope({
      topic: 'telemetry.raw',
      source: 'simulator',
      payload: { vehicle_id: 'v-1', lat: 31.2, lng: 121.4 },
    });

    expect(env.id).toBeDefined();
    expect(env.topic).toBe('telemetry.raw');
    expect(env.source).toBe('simulator');
    expect(env.trace_id).toBeDefined();
    expect(env.span_id).toBeDefined();
    expect(env.version).toBe('1.0');
    expect(env.timestamp).toBeGreaterThan(0);
  });

  it('可指定 trace_id 和 version', () => {
    const env = createEnvelope({
      topic: 'events.alerts',
      source: 'anomaly',
      payload: {},
      trace_id: 'trace-1',
      version: '2.0',
    });
    expect(env.trace_id).toBe('trace-1');
    expect(env.version).toBe('2.0');
  });

  it('序列化 + 反序列化后一致', () => {
    const env = createEnvelope({
      topic: 'telemetry.raw',
      source: 'simulator',
      payload: { a: 1 },
    });
    const buf = serializeEnvelope(env);
    const parsed = parseEnvelope(buf);
    expect(parsed.id).toBe(env.id);
    expect(parsed.payload).toEqual({ a: 1 });
  });

  it('非法信封抛错', () => {
    expect(() => validateEnvelope({ id: 'x' })).toThrow();
  });

  it('parseEnvelope 非法 JSON 抛错', () => {
    expect(() => parseEnvelope('{invalid json')).toThrow();
  });
});
