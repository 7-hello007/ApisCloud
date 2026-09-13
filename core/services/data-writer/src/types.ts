export interface TelemetryRawPayload {
  vehicle_id: string;
  ts: number;
  lat: number;
  lng: number;
  speed: number;
  battery: number;
  heading: number;
  status: 'idle' | 'running' | 'charging' | 'maintenance' | 'offline';
}

export interface TelemetryAggregatedPayload {
  region: string;
  window_start: number;
  window_end: number;
  vehicle_count: number;
  avg_speed: number;
  avg_battery: number;
  low_battery_vehicles?: string[];
  idle_vehicles?: string[];
  region_center?: { lat: number; lng: number };
}

export interface AlertPayload {
  vehicle_id: string;
  alert_type: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  payload?: unknown;
}

export interface DispatchCommandPayload {
  vehicle_id: string;
  command_id: string;
  command_type: string;
  payload?: {
    task_id?: string;
    [key: string]: unknown;
  };
}

export interface DataWriterConfig {
  vehicleLatestTtlSec: number;
  recentAlertsMax: number;
  consumerGroup: string;
  /** 查询端点返回的最大条数，默认 100 */
  queryLimit: number;
}

/**
 * 车辆查询结果。
 */
export interface VehicleQueryRow {
  vehicle_id: string;
  status: string;
  battery: number | null;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  speed: number | null;
  updated_at: string | null;
}

/**
 * 告警查询结果。
 */
export interface AlertQueryRow {
  vehicle_id: string;
  alert_type: string;
  level: string;
  message: string;
  created_at: string;
}

/**
 * 命令查询结果。
 */
export interface CommandQueryRow {
  command_id: string;
  vehicle_id: string | null;
  task_id: string | null;
  command_type: string;
  status: string;
  issued_at: string;
}
