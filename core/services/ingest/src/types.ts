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

export interface DownlinkCommand {
  vehicle_id: string;
  command_id: string;
  command_type: string;
  payload: unknown;
}

export interface IngestConfig {
  mqttUplinkTopic: string;
  mqttCommandPrefix: string;
  consumerGroup: string;
  /** 是否校验下行命令签名（阶段六新增） */
  verifySignature: boolean;
  /** 签名密钥 */
  signSecret: string;
  /** 签名有效期（秒） */
  signTtlSec: number;
}
