import type { AppConfig } from '@apiscloud/libs';

import type { SimulatorConfig } from './types';

/**
 * 从环境变量加载 simulator 配置。
 * 所有字段都有默认值，环境变量缺省时用默认值。
 */
export function loadSimulatorConfig(_appConfig: AppConfig): SimulatorConfig {
  return {
    vehicleCount: readInt('SIMULATOR_VEHICLE_COUNT', 500),
    publishIntervalMs: readInt('SIMULATOR_PUBLISH_INTERVAL_MS', 1000),
    centerLat: readFloat('SIMULATOR_CENTER_LAT', 31.2304),
    centerLng: readFloat('SIMULATOR_CENTER_LNG', 121.4737),
    radiusKm: readFloat('SIMULATOR_RADIUS_KM', 30),
    minSpeed: readFloat('SIMULATOR_MIN_SPEED', 20),
    maxSpeed: readFloat('SIMULATOR_MAX_SPEED', 60),
    mqttTopic: process.env.SIMULATOR_MQTT_TOPIC ?? 'telemetry/raw',
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
