import type { RedisWrapper } from '@apiscloud/libs';

import type {
  AlertPayload,
  TelemetryAggregatedPayload,
  TelemetryRawPayload,
} from './types';

export interface RedisWriter {
  /** 写车辆最新状态 */
  writeVehicleLatest(t: TelemetryRawPayload, ttlSec: number): Promise<void>;
  /** 写最近告警 */
  writeRecentAlert(a: AlertPayload, maxCount: number): Promise<void>;
  /** 写区域聚合统计 */
  writeRegionStats(a: TelemetryAggregatedPayload): Promise<void>;
}

const ACTIVE_VEHICLES_KEY = 'vehicles:active';
const RECENT_ALERTS_KEY = 'alerts:recent';

/**
 * Redis 热路径写入器。
 */
export function createRedisWriter(redis: RedisWrapper): RedisWriter {
  return {
    async writeVehicleLatest(t, ttlSec) {
      const key = `vehicle:${t.vehicle_id}`;
      const latestKey = `${key}:latest`;

      await redis.set(latestKey, JSON.stringify(t), ttlSec);

      await redis.hset(key, 'status', t.status);
      await redis.hset(key, 'battery', String(t.battery));
      await redis.hset(key, 'lat', String(t.lat));
      await redis.hset(key, 'lng', String(t.lng));
      await redis.hset(key, 'heading', String(t.heading));
      await redis.hset(key, 'speed', String(t.speed));
      await redis.hset(key, 'updated_at', String(t.ts));

      const client = redis.raw();
      await client.sadd(ACTIVE_VEHICLES_KEY, t.vehicle_id);
    },

    async writeRecentAlert(a, maxCount) {
      const client = redis.raw();

      const json = JSON.stringify({
        ...a,
        ts: Date.now(),
      });

      await client.lpush(RECENT_ALERTS_KEY, json);
      await client.ltrim(RECENT_ALERTS_KEY, 0, maxCount - 1);
    },

    async writeRegionStats(a) {
      const key = `region:${a.region}:stats`;
      await redis.hset(key, 'window_start', String(a.window_start));
      await redis.hset(key, 'window_end', String(a.window_end));
      await redis.hset(key, 'vehicle_count', String(a.vehicle_count));
      await redis.hset(key, 'avg_speed', String(a.avg_speed));
      await redis.hset(key, 'avg_battery', String(a.avg_battery));
    },
  };
}
