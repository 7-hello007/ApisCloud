import type { PgClient } from '@apiscloud/libs';

import {
  alertToPgParams,
  telemetryToLatestParams,
  telemetryToPgParams,
} from './mapper';
import type { AlertPayload, TelemetryRawPayload } from './types';

export interface PgWriter {
  /** UPSERT 车辆最新状态 */
  upsertVehicleLatest(t: TelemetryRawPayload): Promise<void>;
  /** INSERT 遥测记录 */
  insertTelemetry(t: TelemetryRawPayload): Promise<void>;
  /** INSERT 告警 */
  insertAlert(a: AlertPayload): Promise<void>;
}

const UPSERT_LATEST_SQL = `
  INSERT INTO vehicle_latest
    (vehicle_id, status, battery, lat, lng, heading, speed, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, now())
  ON CONFLICT (vehicle_id) DO UPDATE SET
    status = EXCLUDED.status,
    battery = EXCLUDED.battery,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    heading = EXCLUDED.heading,
    speed = EXCLUDED.speed,
    updated_at = now()
`;

const INSERT_TELEMETRY_SQL = `
  INSERT INTO vehicle_telemetry
    (vehicle_id, ts, lat, lng, speed, battery, heading, payload)
  VALUES ($1, $2::timestamptz, $3, $4, $5, $6, $7, $8::jsonb)
`;

const INSERT_ALERT_SQL = `
  INSERT INTO alerts
    (vehicle_id, alert_type, level, message, payload)
  VALUES ($1, $2, $3, $4, $5::jsonb)
`;

/**
 * PG 写入器。
 * 只负责 SQL 执行，不含业务逻辑。
 */
export function createPgWriter(pg: PgClient): PgWriter {
  return {
    async upsertVehicleLatest(t) {
      await pg.query(UPSERT_LATEST_SQL, telemetryToLatestParams(t));
    },

    async insertTelemetry(t) {
      await pg.query(INSERT_TELEMETRY_SQL, telemetryToPgParams(t));
    },

    async insertAlert(a) {
      await pg.query(INSERT_ALERT_SQL, alertToPgParams(a));
    },
  };
}
