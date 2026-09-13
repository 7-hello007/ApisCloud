import type { AppConfig } from '@apiscloud/libs';

import type { AggregatorConfig } from './types';

export function loadAggregatorConfig(_appConfig: AppConfig): AggregatorConfig {
  return {
    windowMs: readInt('AGGREGATOR_WINDOW_MS', 5000),
    consumerGroup: process.env.AGGREGATOR_CONSUMER_GROUP ?? 'apiscloud-aggregator',
    lowBatteryThreshold: readInt('AGGREGATOR_LOW_BATTERY_THRESHOLD', 20),
    region: process.env.AGGREGATOR_REGION ?? 'global',
    regionCenterLat: readFloat('AGGREGATOR_REGION_CENTER_LAT', 31.2304),
    regionCenterLng: readFloat('AGGREGATOR_REGION_CENTER_LNG', 121.4737),
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

function readFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`环境变量 ${name} 必须是数字，实际：${raw}`);
  }
  return n;
}
