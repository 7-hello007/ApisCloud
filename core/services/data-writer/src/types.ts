/**
 * 上行遥测 payload。
 * 与 simulator / ingest 一致。
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
 * 聚合遥测 payload。
 * 阶段二只做最简处理，阶段五再扩展。
 */
export interface TelemetryAggregatedPayload {
  region: string;
  window_start: number;
  window_end: number;
  vehicle_count: number;
  avg_speed: number;
  avg_battery: number;
}

/**
 * 告警 payload。
 */
export interface AlertPayload {
  vehicle_id: string;
  alert_type: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  payload?: unknown;
}

/**
 * data-writer 运行配置。
 */
export interface DataWriterConfig {
  /** Redis 中车辆最新状态的 TTL（秒），默认 60 */
  vehicleLatestTtlSec: number;
  /** Redis 中最近告警保留条数，默认 100 */
  recentAlertsMax: number;
  /** 总线消费组，默认 apiscloud-data-writer */
  consumerGroup: string;
}

/**
 * 调度命令 payload。
 * 来自 dispatch-core 的 events.commands，与 ingest 的 DownlinkCommand 一致。
 * 额外约束：payload.task_id 用于写审计表。
 */
export interface DispatchCommandPayload {
  vehicle_id: string;
  command_id: string;
  command_type: string;
  payload?: {
    task_id?: string;
    [key: string]: unknown;
  };
}
