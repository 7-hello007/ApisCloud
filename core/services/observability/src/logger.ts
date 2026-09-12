import { createLogger, withContext, type Logger, type LogContext } from '@apiscloud/libs';

import type { TracingContext } from './types';

export interface ObservabilityLoggerOptions {
  service: string;
  layer?: string;
  level?: string;
  pretty?: boolean;
}

/**
 * 创建可观测性专用 logger。
 * 日志字段固定含 service、layer，可通过 withTrace 绑 trace_id、span_id。
 */
export function createObservabilityLogger(
  options: ObservabilityLoggerOptions,
): Logger {
  return createLogger({
    service: options.service,
    layer: options.layer ?? 'single',
    level: options.level ?? 'info',
    pretty: options.pretty ?? false,
  });
}

/**
 * 给 logger 绑追踪上下文。
 * 未来接 OpenTelemetry 时，只需改变 trace_id、span_id 的来源，日志格式不变。
 */
export function withTrace(logger: Logger, ctx: LogContext): Logger {
  return withContext(logger, {
    trace_id: ctx.trace_id,
    span_id: ctx.span_id,
    ...ctx,
  });
}

/**
 * 生成一个简单的 trace 上下文（未来由 OpenTelemetry 替代）。
 * 返回类型明确为 TracingContext，trace_id / span_id 都是必填 string。
 */
export function newTraceContext(): TracingContext {
  return {
    trace_id: randomHex(32),
    span_id: randomHex(16),
  };
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
