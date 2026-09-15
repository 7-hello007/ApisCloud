/**
 * 调度任务类型。
 */
export type TaskType =
  'passenger' | 'inspection' | 'logistics' | 'charging' | 'maintenance' | 'rescue';

/**
 * 车辆状态。
 * 与 simulator / ingest 保持一致。
 */
export type VehicleStatus = 'idle' | 'running' | 'charging' | 'maintenance' | 'offline';

/**
 * 地理坐标。
 */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * 时间窗（毫秒时间戳）。
 */
export interface TimeWindow {
  start: number;
  end: number;
}

/**
 * 调度任务。
 * 外部系统通过 events.tasks 或调度核心内部生成。
 */
export interface DispatchTask {
  task_id: string;
  task_type: TaskType;
  origin: GeoPoint;
  destination?: GeoPoint;
  time_window?: TimeWindow;
  /** 优先级 0-100，越大越紧急 */
  priority: number;
  /** 任务附加约束，算法和过滤可读 */
  constraints?: Record<string, unknown>;
  /** 服务等级，如 economy / premium */
  service_level?: string;
}

/**
 * 候选车辆。
 * 从车辆状态投影得到，供算法插件消费。
 */
export interface DispatchVehicle {
  vehicle_id: string;
  position: GeoPoint;
  status: VehicleStatus;
  battery: number;
  /** 能提供的服务类型，如 ['passenger', 'logistics'] */
  capabilities?: string[];
  /** 车辆附加约束 */
  constraints?: Record<string, unknown>;
}

/**
 * 算法输出：排序后的候选。
 */
export interface RankedVehicle {
  vehicle_id: string;
  score: number;
  reason?: string;
}

/**
 * 算法输入。
 */
export interface DispatchAlgorithmInput {
  task: DispatchTask;
  candidates: DispatchVehicle[];
  context?: Record<string, unknown>;
}

/**
 * 算法输出。
 */
export interface DispatchAlgorithmResult {
  ranked: RankedVehicle[];
}

/**
 * 算法插件接口。
 * 算法插件在 src/index.js 里导出 { algorithm: DispatchAlgorithm }。
 */
export interface DispatchAlgorithm {
  name: string;
  version: string;
  rank(input: DispatchAlgorithmInput): Promise<DispatchAlgorithmResult> | DispatchAlgorithmResult;
}

/**
 * 命令类型。
 * 与 ingest 的 DownlinkCommand.command_type 对齐。
 */
export type CommandType = 'dispatch' | 'cancel' | 'charge' | 'maintenance' | 'rescue';

/**
 * dispatch-core 发出的命令 payload。
 * 外层仍然包在 ingest 的 DownlinkCommand 结构里：
 *   { vehicle_id, command_id, command_type, payload }
 * 这里是 payload 的内容。
 */
export interface DispatchCommandPayload {
  task_id: string;
  task_type: TaskType;
  origin: GeoPoint;
  destination?: GeoPoint;
  issued_at: number;
  signed: {
    command: {
      command_id: string;
      vehicle_id: string;
      task_id: string;
      command_type: string;
      payload: unknown;
      issued_at: number;
    };
    signature: string;
    algorithm: string;
  };
}

/**
 * 目标函数权重。
 */
export interface ObjectiveWeights {
  distance: number;
  eta: number;
  battery: number;
  priority: number;
}

/**
 * dispatch-core 运行配置。
 */
export interface DispatchCoreConfig {
  /** 默认算法名 */
  defaultAlgorithm: string;
  /** 回退算法名 */
  fallbackAlgorithm: string;
  /** 算法超时（毫秒） */
  algorithmTimeoutMs: number;
  /** 总线消费组 */
  consumerGroup: string;
  /** 目标函数权重 */
  weights: ObjectiveWeights;
  /** 指令签名密钥 */
  signSecret: string;
  /** 指令签名 TTL（秒），当前用 libs 默认 60s */
  signTtlSec: number;
  /** 运营区域中心纬度 */
  regionCenterLat: number;
  /** 运营区域中心经度 */
  regionCenterLng: number;
  /** 运营区域半径（km） */
  regionRadiusKm: number;
}
