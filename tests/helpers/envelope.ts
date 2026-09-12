import { createEnvelope, type Envelope } from '@apiscloud/message-bus';

export interface MakeEnvelopeOptions<T> {
  topic?: string;
  source?: string;
  payload?: T;
  trace_id?: string;
  span_id?: string;
}

/**
 * 创建测试用 Envelope，所有字段可覆盖。
 */
export function makeEnvelope<T = unknown>(
  options: MakeEnvelopeOptions<T> = {},
): Envelope<T> {
  return createEnvelope({
    topic: options.topic ?? 'telemetry.raw',
    source: options.source ?? 'test',
    payload: (options.payload ?? { test: true }) as T,
    trace_id: options.trace_id,
    span_id: options.span_id,
  });
}
