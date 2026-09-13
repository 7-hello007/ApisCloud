export const AGGREGATOR_VERSION = '0.1.0';

// 服务
export { createAggregatorService } from './service';
export type { AggregatorService, AggregatorServiceOptions } from './service';

// 配置
export { loadAggregatorConfig } from './config';

// 时间窗
export { AggregationWindow } from './window';

// 聚合
export { aggregate } from './aggregator';
export type { AggregateInput } from './aggregator';

// 映射
export { extractTelemetryRaw, aggregatedToEnvelope } from './mapper';

// 类型
export type {
  TelemetryRawPayload,
  AggregatedPayload,
  AggregatorConfig,
} from './types';
