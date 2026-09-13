import { createEnvelope, TOPICS, type Envelope } from '@apiscloud/message-bus';

import type { AggregatedPayload, TelemetryRawPayload } from './types';

/**
 * 从 telemetry.raw Envelope 提取 payload。
 */
export function extractTelemetryRaw(env: Envelope): TelemetryRawPayload {
  return env.payload as TelemetryRawPayload;
}

/**
 * 聚合结果 → Envelope。
 */
export function aggregatedToEnvelope(
  payload: AggregatedPayload,
): Envelope<AggregatedPayload> {
  return createEnvelope({
    topic: TOPICS.TELEMETRY_AGGREGATED,
    source: 'aggregator',
    payload,
  });
}
