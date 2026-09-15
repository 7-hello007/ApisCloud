import { createEnvelope, TOPICS, type Envelope } from '@apiscloud/message-bus';

import type { DownlinkCommand, UplinkTelemetry } from './types';

/**
 * 上行遥测 → Envelope。
 * 信封 source 固定为 ingest。
 */
export function telemetryToEnvelope(telemetry: UplinkTelemetry): Envelope<UplinkTelemetry> {
  return createEnvelope({
    topic: TOPICS.TELEMETRY_RAW,
    source: 'ingest',
    payload: telemetry,
  });
}

/**
 * Envelope → 下行命令。
 * 提取 payload 作为命令。
 */
export function envelopeToCommand(env: Envelope): DownlinkCommand {
  return env.payload as DownlinkCommand;
}
