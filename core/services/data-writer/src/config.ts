import type { AppConfig } from '@apiscloud/libs';

import type { DataWriterConfig } from './types';

export function loadDataWriterConfig(_appConfig: AppConfig): DataWriterConfig {
  return {
    vehicleLatestTtlSec: readInt('DATA_WRITER_LATEST_TTL_SEC', 60),
    recentAlertsMax: readInt('DATA_WRITER_RECENT_ALERTS_MAX', 100),
    consumerGroup: process.env.DATA_WRITER_CONSUMER_GROUP ?? 'apiscloud-data-writer',
    queryLimit: readInt('DATA_WRITER_QUERY_LIMIT', 100),
  };
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`环境变量 ${name} 必须是正整数，实际：${raw}`);
  }
  return n;
}
