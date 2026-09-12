import type { Envelope } from '@apiscloud/message-bus';

import type {
  AlertPayload,
  TelemetryAggregatedPayload,
  TelemetryRawPayload,
} from './types';

/**
 * 从 Envelope 提取遥测 payload。
 */
export function extractTelemetryRaw(env: Envelope): TelemetryRawPayload {
  return env.payload as TelemetryRawPayload;
}

/**
 * 从 Envelope 提取聚合遥测 payload。
 */
export function extractTelemetryAggregated(env: Envelope): TelemetryAggregatedPayload {
  return env.payload as TelemetryAggregatedPayload;
}

/**
 * 从 Envelope 提取告警 payload。
 */
export function extractAlert(env: Envelope): AlertPayload {
  return env.payload as AlertPayload;
}

/**
 * 把遥测 payload 转为 PG vehicle_telemetry 表参数。
 * ts 从毫秒时间戳转为 ISO 字符串。
 */
export function telemetryToPgParams(t: TelemetryRawPayload): unknown[] {
  return [
    t.vehicle_id,
    new Date(t.ts).toISOString(),
    t.lat,
    t.lng,
    t.speed,
    t.battery,
    t.heading,
    JSON.stringify(t),
  ];
}

/**
 * 把遥测 payload 转为 PG vehicle_latest 表参数。
 */
export function telemetryToLatestParams(t: TelemetryRawPayload): unknown[] {
  return [
    t.vehicle_id,
    t.status,
    t.battery,
    t.lat,
    t.lng,
    t.heading,
    t.speed,
  ];
}

/**
 * 把告警 payload 转为 PG alerts 表参数。
 */
export function alertToPgParams(a: AlertPayload): unknown[] {
  return [
    a.vehicle_id,
    a.alert_type,
    a.level,
    a.message,
    a.payload ? JSON.stringify(a.payload) : null,
  ];
}
