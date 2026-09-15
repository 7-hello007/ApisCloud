import type { AggregatedPayload, TelemetryRawPayload } from './types';

export interface AggregateInput {
  snapshots: TelemetryRawPayload[];
  windowStart: number;
  windowEnd: number;
  region: string;
  regionCenter: { lat: number; lng: number };
  lowBatteryThreshold: number;
}

/**
 * 把一批遥测快照聚合成一条 AggregatedPayload。
 * 纯函数，无副作用。
 */
export function aggregate(input: AggregateInput): AggregatedPayload {
  const { snapshots, windowStart, windowEnd, region, regionCenter, lowBatteryThreshold } = input;

  const vehicleCount = snapshots.length;

  if (vehicleCount === 0) {
    return {
      region,
      window_start: windowStart,
      window_end: windowEnd,
      vehicle_count: 0,
      avg_speed: 0,
      avg_battery: 0,
      low_battery_vehicles: [],
      idle_vehicles: [],
      region_center: regionCenter,
    };
  }

  let speedSum = 0;
  let batterySum = 0;
  const lowBatteryVehicles: string[] = [];
  const idleVehicles: string[] = [];

  for (const s of snapshots) {
    speedSum += s.speed;
    batterySum += s.battery;
    if (s.battery < lowBatteryThreshold) {
      lowBatteryVehicles.push(s.vehicle_id);
    }
    if (s.status === 'idle') {
      idleVehicles.push(s.vehicle_id);
    }
  }

  return {
    region,
    window_start: windowStart,
    window_end: windowEnd,
    vehicle_count: vehicleCount,
    avg_speed: round(speedSum / vehicleCount),
    avg_battery: round(batterySum / vehicleCount),
    low_battery_vehicles: lowBatteryVehicles,
    idle_vehicles: idleVehicles,
    region_center: regionCenter,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
