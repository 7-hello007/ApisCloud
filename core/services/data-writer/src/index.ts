export const DATA_WRITER_VERSION = '0.1.0';

// 服务
export { createDataWriterService } from './service';
export type { DataWriterService, DataWriterServiceOptions } from './service';

// 配置
export { loadDataWriterConfig } from './config';

// 写入器
export { createPgWriter } from './pg-writer';
export type { PgWriter } from './pg-writer';
export { createRedisWriter } from './redis-writer';
export type { RedisWriter } from './redis-writer';

// 映射
export {
  extractTelemetryRaw,
  extractTelemetryAggregated,
  extractAlert,
  telemetryToPgParams,
  telemetryToLatestParams,
  alertToPgParams,
} from './mapper';

// handlers
export { handleTelemetryRaw } from './handlers/telemetry-raw';
export type { TelemetryRawDeps } from './handlers/telemetry-raw';
export { handleTelemetryAggregated } from './handlers/telemetry-aggregated';
export type { TelemetryAggregatedDeps } from './handlers/telemetry-aggregated';
export { handleEventsAlerts } from './handlers/events-alerts';
export type { EventsAlertsDeps } from './handlers/events-alerts';

// 类型
export type {
  TelemetryRawPayload,
  TelemetryAggregatedPayload,
  AlertPayload,
  DataWriterConfig,
} from './types';
