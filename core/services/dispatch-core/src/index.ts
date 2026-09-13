export const DISPATCH_CORE_VERSION = '0.1.0';

// 服务
export { createDispatchCoreService } from './service';
export type { DispatchCoreService, DispatchCoreServiceOptions } from './service';

// 配置
export { loadDispatchCoreConfig } from './config';

// 校验
export {
  DispatchTaskSchema,
  DispatchVehicleSchema,
  GeoPointSchema,
  TimeWindowSchema,
  TaskTypeSchema,
  VehicleStatusSchema,
  parseTask,
  parseVehicle,
} from './validation';

// 约束
export { filterCandidates, MIN_BATTERY_PERCENT, MAX_PICKUP_DISTANCE_KM } from './constraints';
export type { ConstraintResult, ConstraintRejection } from './constraints';

// 目标函数
export { scoreVehicles } from './objective';
export type { ScoredVehicle, ScoreBreakdown } from './objective';

// 算法
export { AlgorithmRegistry } from './algorithm-registry';
export { loadAlgorithmsFromDir } from './algorithm-loader';
export { extractAlgorithm, isDispatchAlgorithm } from './algorithm-interface';
export type { AlgorithmModule } from './algorithm-interface';

// 命令
export { buildDispatchCommand } from './command-builder';
export type { BuildCommandOptions, BuiltCommand } from './command-builder';

// 映射
export { telemetryToVehicle, commandToEnvelope, envelopeToTask } from './mapper';

// 地理
export { distanceKm, estimateEtaSec, isWithinRadius } from './geo';

// 类型
export type {
  TaskType,
  VehicleStatus,
  GeoPoint,
  TimeWindow,
  DispatchTask,
  DispatchVehicle,
  RankedVehicle,
  DispatchAlgorithmInput,
  DispatchAlgorithmResult,
  DispatchAlgorithm,
  CommandType,
  DispatchCommandPayload,
  ObjectiveWeights,
  DispatchCoreConfig,
} from './types';
