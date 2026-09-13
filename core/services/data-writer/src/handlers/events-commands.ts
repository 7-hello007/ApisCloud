import type { Logger } from '@apiscloud/libs';
import type { Envelope } from '@apiscloud/message-bus';
import { TOPICS } from '@apiscloud/message-bus';
import type { ObservabilityMetrics } from '@apiscloud/observability';

import { extractDispatchCommand } from '../mapper';
import type { PgWriter } from '../pg-writer';

export interface EventsCommandsDeps {
  pgWriter: PgWriter;
  logger: Logger;
  metrics: ObservabilityMetrics;
}

/**
 * 处理 events.commands。
 * 只写审计表，不做业务处理（业务处理由 ingest 完成，转发 MQTT）。
 */
export async function handleEventsCommands(
  env: Envelope,
  deps: EventsCommandsDeps,
): Promise<void> {
  const payload = extractDispatchCommand(env);

  await deps.pgWriter.insertDispatchCommand(payload);

  deps.metrics.dataFlowMessages.inc({
    topic: TOPICS.EVENTS_COMMANDS,
    direction: 'in',
  });

  deps.logger.debug(
    { commandId: payload.command_id, vehicleId: payload.vehicle_id },
    'events.commands 已处理',
  );
}
