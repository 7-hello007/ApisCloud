import type { Logger } from '@apiscloud/libs';
import type { Envelope } from '@apiscloud/message-bus';
import { TOPICS } from '@apiscloud/message-bus';
import type { ObservabilityMetrics } from '@apiscloud/observability';

import { extractTelemetryRaw } from '../mapper';
import type { PgWriter } from '../pg-writer';
import type { RedisWriter } from '../redis-writer';
import type { DataWriterConfig } from '../types';

export interface TelemetryRawDeps {
  pgWriter: PgWriter;
  redisWriter: RedisWriter;
  logger: Logger;
  metrics: ObservabilityMetrics;
  config: DataWriterConfig;
}

/**
 * 处理 telemetry.raw。
 */
export async function handleTelemetryRaw(
  env: Envelope,
  deps: TelemetryRawDeps,
): Promise<void> {
  const payload = extractTelemetryRaw(env);

  await deps.pgWriter.upsertVehicleLatest(payload);
  await deps.pgWriter.insertTelemetry(payload);
  await deps.redisWriter.writeVehicleLatest(payload, deps.config.vehicleLatestTtlSec);

  deps.metrics.dataFlowMessages.inc({
    topic: TOPICS.TELEMETRY_RAW,
    direction: 'in',
  });

  deps.logger.debug({ vehicleId: payload.vehicle_id }, 'telemetry.raw 已处理');
}
