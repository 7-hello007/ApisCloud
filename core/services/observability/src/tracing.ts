import type { Logger } from '@apiscloud/libs';

import { newTraceContext, withTrace } from './logger';

/**
 * 追踪上下文管理。
 * 当前阶段只做日志字段预留，不接 OpenTelemetry。
 * 未来接 OTel 时，把 newTraceContext 换成 OTel 的 context 即可，日志格式不变。
 */
export interface TraceSpan {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  name: string;
  startTime: number;
  endTime?: number;
  tags: Record<string, string | number>;
}

export class Tracer {
  private readonly spans = new Map<string, TraceSpan>();

  constructor(private readonly logger: Logger) {}

  startSpan(name: string, parentSpanId?: string): TraceSpan {
    const ctx = newTraceContext();
    const span: TraceSpan = {
      trace_id: ctx.trace_id,
      span_id: ctx.span_id,
      parent_span_id: parentSpanId,
      name,
      startTime: Date.now(),
      tags: {},
    };
    this.spans.set(span.span_id, span);

    const log = withTrace(this.logger, {
      trace_id: span.trace_id,
      span_id: span.span_id,
    });
    log.debug({ span: name }, 'span 开始');

    return span;
  }

  endSpan(spanId: string, tags?: Record<string, string | number>): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    if (tags) {
      Object.assign(span.tags, tags);
    }

    const log = withTrace(this.logger, {
      trace_id: span.trace_id,
      span_id: span.span_id,
    });
    log.debug(
      { span: span.name, durationMs: span.endTime - span.startTime, ...span.tags },
      'span 结束',
    );

    this.spans.delete(spanId);
  }

  /** 列出当前未结束的 span，用于调试 */
  activeSpans(): TraceSpan[] {
    return Array.from(this.spans.values());
  }
}
