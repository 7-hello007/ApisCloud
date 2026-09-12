/**
 * 上行遥测消息。
 * 与 simulator 的 VehicleState 字段一致。
 */
export interface UplinkTelemetry {
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
 * 下行命令。
 * 来自总线 events.commands，转发到 MQTT commands/{vehicle_id}。
 */
export interface DownlinkCommand {
  vehicle_id: string;
  command_id: string;
  command_type: string;
  payload: unknown;
}

/**
 * ingest 运行配置。
 */
export interface IngestConfig {
  /** MQTT 上行主题（订阅外部遥测），默认 telemetry/raw */
  mqttUplinkTopic: string;
  /** MQTT 下行主题前缀，默认 commands/ */
  mqttCommandPrefix: string;
  /** 总线订阅的消费者组，默认 apiscloud-ingest */
  consumerGroup: string;
}