import type { AppConfig } from '@apiscloud/libs';

import type { IngestConfig } from './types';

export function loadIngestConfig(_appConfig: AppConfig): IngestConfig {
  return {
    mqttUplinkTopic: process.env.INGEST_MQTT_TOPIC ?? 'telemetry/raw',
    mqttCommandPrefix: process.env.INGEST_MQTT_COMMAND_PREFIX ?? 'commands/',
    consumerGroup: process.env.INGEST_CONSUMER_GROUP ?? 'apiscloud-ingest',
    verifySignature: readBool('INGEST_VERIFY_SIGNATURE', false),
    signSecret: process.env.DISPATCH_SIGN_SECRET ?? 'change-me-command-sign-secret',
    signTtlSec: readInt('INGEST_SIGN_TTL_SEC', 60),
  };
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
