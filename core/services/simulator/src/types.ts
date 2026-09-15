/**
 * 车辆状态。
 * 与 ingest 上报到总线的 payload 字段保持一致。
 */
export type VehicleStatus = 'idle' | 'running' | 'charging' | 'maintenance' | 'offline';

export interface VehicleState {
  /** 车辆唯一标识 */
  vehicle_id: string;
  /** 毫秒时间戳 */
  ts: number;
  /** 纬度 */
  lat: number;
  /** 经度 */
  lng: number;
  /** 速度（km/h） */
  speed: number;
  /** 电量（0-100） */
  battery: number;
  /** 航向（0-360） */
  heading: number;
  /** 车辆状态 */
  status: VehicleStatus;
}

/**
 * 地理坐标点。
 */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * 模拟器运行配置。
 * 从环境变量读取，便于阶段五压测时动态调整。
 */
export interface SimulatorConfig {
  /** 模拟车辆数，默认 500 */
  vehicleCount: number;
  /** 上报间隔（毫秒），默认 1000 */
  publishIntervalMs: number;
  /** 运营中心纬度，默认上海 */
  centerLat: number;
  /** 运营中心经度，默认上海 */
  centerLng: number;
  /** 运营半径（km），默认 30 */
  radiusKm: number;
  /** 最小速度（km/h），默认 20 */
  minSpeed: number;
  /** 最大速度（km/h），默认 60 */
  maxSpeed: number;
  /** MQTT 上报主题，默认 telemetry/raw */
  mqttTopic: string;
}
