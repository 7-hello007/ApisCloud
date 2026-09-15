export const OBSERVABILITY_VERSION = '0.1.0';

// types
export type {
  ObservabilityOptions,
  TracingContext,
  RequestMetrics,
  DataFlowMetrics,
  PluginMetrics,
} from './types';

// metrics
export { createObservabilityMetrics } from './metrics';
export type { ObservabilityMetrics } from './metrics';

// health
export { createObservabilityHealth } from './health';
export type { ObservableTarget } from './health';

// logger
export { createObservabilityLogger, withTrace, newTraceContext } from './logger';
export type { ObservabilityLoggerOptions } from './logger';

// tracing
export { Tracer } from './tracing';
export type { TraceSpan } from './tracing';

// server
export { createServer } from './server';
export type { ServerOptions, ObservabilityServer } from './server';

// service
export { createObservabilityService } from './service';
export type { ObservabilityService } from './service';
