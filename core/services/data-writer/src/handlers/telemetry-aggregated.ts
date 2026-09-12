import type { Logger } from '@apiscloud/libs';
import type { Envelope } from '@apiscloud/message-bus';
import { TOPICS } from '@apiscloud/message-bus';
import type { ObservabilityMetrics } from '@apiscloud/observability';

import { extractTelemetryAggregated } from '../mapper';
import type { RedisWriter } from '../redis-writer';

export interface TelemetryAggregatedDeps {
  redisWriter: RedisWriter;
  logger: Logger;
  metrics: ObservabilityMetrics;
}

/**
 * 处理 telemetry.aggregated。
 */
export async function handleTelemetryAggregated(
  env: Envelope,
  deps: TelemetryAggregatedDeps,
): Promise<void> {
  const payload = extractTelemetryAggregated(env);

  await deps.redisWriter.writeRegionStats(payload);

  deps.metrics.dataFlowMessages.inc({
    topic: TOPICS.TELEMETRY_AGGREGATED,
    direction: 'in',
  });

  deps.logger.debug({ region: payload.region }, 'telemetry.aggregated 已处理');
}
