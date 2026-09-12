import type { Logger } from '@apiscloud/libs';

export interface ObservabilityOptions {
  /** 服务名，用于指标默认标签和日志 */
  service: string;
  /** 层级，默认 single */
  layer?: string;
  /** HTTP 端口 */
  port: number;
  /** 日志级别 */
  logLevel?: string;
  /** 是否用 pino-pretty（开发环境） */
  prettyLogs?: boolean;
  /** 外部注入的 logger，不传则内部创建 */
  logger?: Logger;
}

export interface TracingContext {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  [key: string]: unknown;
}

export interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  durationSec: number;
}

export interface DataFlowMetrics {
  topic: string;
  direction: 'in' | 'out';
  count: number;
  latencySec?: number;
}

export interface PluginMetrics {
  plugin: string;
  action: 'load' | 'unload' | 'message' | 'timer';
  success: boolean;
  durationSec?: number;
}
