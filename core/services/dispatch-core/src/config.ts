import type { AppConfig } from '@apiscloud/libs';

import type { DispatchCoreConfig, ObjectiveWeights } from './types';

/**
 * 从环境变量加载 dispatch-core 配置。
 * 所有字段都有默认值，环境变量缺省时用默认值。
 */
export function loadDispatchCoreConfig(_appConfig: AppConfig): DispatchCoreConfig {
  return {
    defaultAlgorithm: process.env.DISPATCH_ALGORITHM ?? 'nearest',
    fallbackAlgorithm: process.env.DISPATCH_FALLBACK_ALGORITHM ?? 'nearest',
    algorithmTimeoutMs: readInt('DISPATCH_ALGORITHM_TIMEOUT_MS', 500),
    consumerGroup: process.env.DISPATCH_CONSUMER_GROUP ?? 'apiscloud-dispatch-core',
    weights: loadWeights(),
    signSecret: process.env.DISPATCH_SIGN_SECRET ?? 'change-me-command-sign-secret',
    signTtlSec: readInt('DISPATCH_SIGN_TTL_SEC', 60),
    regionCenterLat: readFloat('DISPATCH_REGION_CENTER_LAT', 31.2304),
    regionCenterLng: readFloat('DISPATCH_REGION_CENTER_LNG', 121.4737),
    regionRadiusKm: readFloat('DISPATCH_REGION_RADIUS_KM', 30),
  };
}

function loadWeights(): ObjectiveWeights {
  return {
    distance: readFloat('DISPATCH_WEIGHT_DISTANCE', 1.0),
    eta: readFloat('DISPATCH_WEIGHT_ETA', 0.5),
    battery: readFloat('DISPATCH_WEIGHT_BATTERY', 0.3),
    priority: readFloat('DISPATCH_WEIGHT_PRIORITY', 2.0),
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
