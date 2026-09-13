import { distanceKm, estimateEtaSec, isWithinRadius } from './geo';
import type { DispatchCoreConfig, DispatchTask, DispatchVehicle } from './types';

export interface ConstraintRejection {
  vehicle: DispatchVehicle;
  reason: string;
}

export interface ConstraintResult {
  passed: DispatchVehicle[];
  rejected: ConstraintRejection[];
}

/** 最低电量阈值（%） */
export const MIN_BATTERY_PERCENT = 20;

/** 车辆到任务起点的最大 pickup 距离（km） */
export const MAX_PICKUP_DISTANCE_KM = 50;

/** 平均行驶速度（km/h），用于 ETA 估算 */
export const AVG_SPEED_KMH = 30;

/**
 * 硬约束过滤。
 * 依次检查：状态、电量、服务能力、地理、pickup 距离、时间窗。
 */
export function filterCandidates(
  task: DispatchTask,
  vehicles: DispatchVehicle[],
  config: DispatchCoreConfig,
): ConstraintResult {
  const passed: DispatchVehicle[] = [];
  const rejected: ConstraintRejection[] = [];

  for (const vehicle of vehicles) {
    const reason = checkVehicle(task, vehicle, config);
    if (reason) {
      rejected.push({ vehicle, reason });
    } else {
      passed.push(vehicle);
    }
  }

  return { passed, rejected };
}

/**
 * 返回拒绝原因，通过返回 null。
 */
function checkVehicle(
  task: DispatchTask,
  vehicle: DispatchVehicle,
  config: DispatchCoreConfig,
): string | null {
  // 1. 状态约束：只有 idle 车辆能接新任务
  if (vehicle.status !== 'idle') {
    return `状态不是 idle：${vehicle.status}`;
  }

  // 2. 电量约束
  if (vehicle.battery < MIN_BATTERY_PERCENT) {
    return `电量不足：${vehicle.battery}% < ${MIN_BATTERY_PERCENT}%`;
  }

  // 3. 服务能力约束（capabilities 为空则不校验）
  if (vehicle.capabilities && vehicle.capabilities.length > 0) {
    if (!vehicle.capabilities.includes(task.task_type)) {
      return `不支持任务类型：${task.task_type}`;
    }
  }

  // 4. 地理约束：车辆在运营区域内
  const regionCenter = { lat: config.regionCenterLat, lng: config.regionCenterLng };
  if (!isWithinRadius(vehicle.position, regionCenter, config.regionRadiusKm)) {
    return '车辆在运营区域外';
  }

  // 5. pickup 距离约束
  const pickupDistance = distanceKm(vehicle.position, task.origin);
  if (pickupDistance > MAX_PICKUP_DISTANCE_KM) {
    return `pickup 距离过远：${pickupDistance.toFixed(1)}km`;
  }

  // 6. 时间窗约束
  if (task.time_window) {
    const etaSec = estimateEtaSec(pickupDistance, AVG_SPEED_KMH);
    const arrivalMs = Date.now() + etaSec * 1000;
    if (arrivalMs > task.time_window.end) {
      return '无法在时间窗内到达';
    }
  }

  return null;
}
