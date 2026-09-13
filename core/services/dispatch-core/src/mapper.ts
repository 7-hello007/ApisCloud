import { createEnvelope, TOPICS, type Envelope } from '@apiscloud/message-bus';

import type { BuiltCommand } from './command-builder';
import type { DispatchTask, DispatchVehicle } from './types';

/**
 * 从遥测 Envelope 提取车辆状态。
 * 遥测 payload 与 simulator 的 VehicleState 一致。
 */
export function telemetryToVehicle(env: Envelope): DispatchVehicle {
  const payload = env.payload as {
    vehicle_id: string;
    lat: number;
    lng: number;
    status: string;
    battery: number;
  };

  return {
    vehicle_id: payload.vehicle_id,
    position: { lat: payload.lat, lng: payload.lng },
    status: payload.status as DispatchVehicle['status'],
    battery: payload.battery,
  };
}

/**
 * 命令 → Envelope。
 */
export function commandToEnvelope(cmd: BuiltCommand): Envelope<BuiltCommand> {
  return createEnvelope({
    topic: TOPICS.EVENTS_COMMANDS,
    source: 'dispatch-core',
    payload: cmd,
  });
}

/**
 * 从 Envelope 提取任务。
 * 当前任务通过内部 submitTask 提交；
 * 未来若引入 events.tasks 主题，也从这里提取。
 */
export function envelopeToTask(env: Envelope): DispatchTask {
  return env.payload as DispatchTask;
}
