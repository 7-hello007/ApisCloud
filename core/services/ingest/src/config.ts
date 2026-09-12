import type { AppConfig } from '@apiscloud/libs';

import type { IngestConfig } from './types';

/**
 * 从环境变量加载 ingest 配置。
 */
export function loadIngestConfig(_appConfig: AppConfig): IngestConfig {
  return {
    mqttUplinkTopic: process.env.INGEST_MQTT_TOPIC ?? 'telemetry/raw',
    mqttCommandPrefix: process.env.INGEST_MQTT_COMMAND_PREFIX ?? 'commands/',
    consumerGroup: process.env.INGEST_CONSUMER_GROUP ?? 'apiscloud-ingest',
  };
}