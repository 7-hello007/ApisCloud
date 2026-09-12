export const SIMULATOR_VERSION = '0.1.0';

// 服务
export { createSimulatorService } from './service';
export type { SimulatorService, SimulatorServiceOptions } from './service';

// 配置
export { loadSimulatorConfig } from './config';

// 车队和车辆
export { Fleet } from './fleet';
export { Vehicle } from './vehicle';

// GPS
export { randomPointInRadius, distanceKm, moveTowards, bearing } from './gps-generator';

// 状态机
export { nextState, nextBattery, BATTERY_LOW, BATTERY_CRITICAL, BATTERY_FULL } from './state-machine';
export type { StateInput } from './state-machine';

// 类型
export type { VehicleState, VehicleStatus, SimulatorConfig, GeoPoint } from './types';

// MQTT
export { createMqttPublisher } from './mqtt-publisher';
export type { MqttPublisher } from './mqtt-publisher';