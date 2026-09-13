/**
 * 单条原始遥测，与 simulator / ingest 一致。
 */
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

/**
 * 聚合后的遥测。
 * 扩展了低电量车辆、空闲车辆、区域中心，供下游插件使用。
 */
export interface AggregatedPayload {
  region: string;
  window_start: number;
  window_end: number;
  vehicle_count: number;
  avg_speed: number;
  avg_battery: number;
  /** 电量低于阈值的车辆 ID 列表 */
  low_battery_vehicles: string[];
  /** 状态为 idle 的车辆 ID 列表 */
  idle_vehicles: string[];
  /** 区域中心 */
  region_center: { lat: number; lng: number };
}

/**
 * aggregator 运行配置。
 */
export interface AggregatorConfig {
  /** 聚合窗口毫秒数，默认 5000 */
  windowMs: number;
  /** 总线消费组，默认 apiscloud-aggregator */
  consumerGroup: string;
  /** 低电量阈值（%），默认 20 */
  lowBatteryThreshold: number;
  /** 区域标识，默认 global */
  region: string;
  /** 区域中心纬度 */
  regionCenterLat: number;
  /** 区域中心经度 */
  regionCenterLng: number;
}
