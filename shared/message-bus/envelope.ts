import { randomUUID } from 'node:crypto';

import { z } from 'zod';

/**
 * 统一消息信封。
 * 所有通过消息总线的消息都必须符合此结构。
 */
export const EnvelopeSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  source: z.string().min(1),
  timestamp: z.number().int().positive(),
  trace_id: z.string().min(1),
  span_id: z.string().min(1),
  version: z.string().min(1),
  payload: z.unknown(),
});

export type Envelope<T = unknown> = {
  id: string;
  topic: string;
  source: string;
  timestamp: number;
  trace_id: string;
  span_id: string;
  version: string;
  payload: T;
};

export interface CreateEnvelopeOptions<T> {
  topic: string;
  source: string;
  payload: T;
  trace_id?: string;
  span_id?: string;
  version?: string;
}

/**
 * 创建标准信封。未提供 trace_id/span_id 时自动生成。
 */
export function createEnvelope<T>(options: CreateEnvelopeOptions<T>): Envelope<T> {
  return {
    id: randomUUID(),
    topic: options.topic,
    source: options.source,
    timestamp: Date.now(),
    trace_id: options.trace_id ?? randomUUID(),
    span_id: options.span_id ?? randomUUID(),
    version: options.version ?? '1.0',
    payload: options.payload,
  };
}

/**
 * 校验信封合法性。非法直接抛错。
 */
export function validateEnvelope(input: unknown): Envelope {
  const result = EnvelopeSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`信封校验失败：${issues}`);
  }
  return result.data as Envelope;
}

/**
 * 从原始 payload 反序列化为 Envelope。
 */
export function parseEnvelope(raw: string | Buffer): Envelope {
  const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`信封 JSON 解析失败：${message}`);
  }
  return validateEnvelope(parsed);
}

/**
 * 序列化 Envelope 为 Buffer。
 */
export function serializeEnvelope(env: Envelope): Buffer {
  return Buffer.from(JSON.stringify(env), 'utf-8');
}
