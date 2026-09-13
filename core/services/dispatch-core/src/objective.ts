import { distanceKm, estimateEtaSec } from './geo';
import type { DispatchTask, DispatchVehicle, ObjectiveWeights } from './types';

/** 归一化参考距离（km），用于把距离映射到 [-1, 0] */
const REFERENCE_DISTANCE_KM = 50;

/** 平均速度（km/h），用于 ETA */
const AVG_SPEED_KMH = 30;

/** 归一化参考 ETA（秒） */
const REFERENCE_ETA_SEC = (REFERENCE_DISTANCE_KM / AVG_SPEED_KMH) * 3600;

export interface ScoreBreakdown {
  distance: number;
  eta: number;
  battery: number;
  priority: number;
}

export interface ScoredVehicle {
  vehicle_id: string;
  score: number;
  distanceKm: number;
  etaSec: number;
  breakdown: ScoreBreakdown;
}

/**
 * 目标函数加权。
 * score = w_distance * (-distance/50)
 *       + w_eta * (-eta/refEta)
 *       + w_battery * (battery/100)
 *       + w_priority * (priority/100)
 * score 越大越好。
 */
export function scoreVehicles(
  task: DispatchTask,
  vehicles: DispatchVehicle[],
  weights: ObjectiveWeights,
): ScoredVehicle[] {
  const scored = vehicles.map((vehicle) => {
    const distance = distanceKm(vehicle.position, task.origin);
    const eta = estimateEtaSec(distance, AVG_SPEED_KMH);

    const distanceScore = -distance / REFERENCE_DISTANCE_KM;
    const etaScore = -eta / REFERENCE_ETA_SEC;
    const batteryScore = vehicle.battery / 100;
    const priorityScore = task.priority / 100;

    const score =
      weights.distance * distanceScore +
      weights.eta * etaScore +
      weights.battery * batteryScore +
      weights.priority * priorityScore;

    return {
      vehicle_id: vehicle.vehicle_id,
      score,
      distanceKm: distance,
      etaSec: eta,
      breakdown: {
        distance: distanceScore,
        eta: etaScore,
        battery: batteryScore,
        priority: priorityScore,
      },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
