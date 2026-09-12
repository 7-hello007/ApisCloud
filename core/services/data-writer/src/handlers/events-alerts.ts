import type { Logger } from '@apiscloud/libs';
import type { Envelope } from '@apiscloud/message-bus';
import { TOPICS } from '@apiscloud/message-bus';
import type { ObservabilityMetrics } from '@apiscloud/observability';

import { extractAlert } from '../mapper';
import type { PgWriter } from '../pg-writer';
import type { RedisWriter } from '../redis-writer';
import type { DataWriterConfig } from '../types';

export interface EventsAlertsDeps {
  pgWriter: PgWriter;
  redisWriter: RedisWriter;
  logger: Logger;
  metrics: ObservabilityMetrics;
  config: DataWriterConfig;
}

/**
 * 处理 events.alerts。
 */
export async function handleEventsAlerts(
  env: Envelope,
  deps: EventsAlertsDeps,
): Promise<void> {
  const payload = extractAlert(env);

  await deps.pgWriter.insertAlert(payload);
  await deps.redisWriter.writeRecentAlert(payload, deps.config.recentAlertsMax);

  deps.metrics.dataFlowMessages.inc({
    topic: TOPICS.EVENTS_ALERTS,
    direction: 'in',
  });

  deps.logger.debug(
    { vehicleId: payload.vehicle_id, alertType: payload.alert_type },
    'events.alerts 已处理',
  );
}
