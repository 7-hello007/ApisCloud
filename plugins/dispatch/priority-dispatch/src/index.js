'use strict';

/**
 * 优先级调度算法。
 * 根据任务优先级动态调整权重：
 *   优先级高（接近 100）→ 更重视距离（快速到达）
 *   优先级低（接近 0）  → 更重视电量（节省能耗）
 *
 * 权重公式：
 *   distanceWeight = 0.2 + priorityNorm * 0.8   // 0.2 ~ 1.0
 *   batteryWeight  = 1.0 - distanceWeight       // 0.8 ~ 0.0
 *
 * 得分 = distanceWeight * (-distance/ref) + batteryWeight * (battery/100)
 * 得分越大越好。
 */

const EARTH_RADIUS_KM = 6371;
const REFERENCE_DISTANCE_KM = 50;

function distanceKm(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

module.exports = {
  algorithm: {
    name: 'priority-dispatch',
    version: '1.0.0',

    rank(input) {
      const { task, candidates } = input;

      const priorityNorm = Math.max(0, Math.min(1, task.priority / 100));
      const distanceWeight = 0.2 + priorityNorm * 0.8;
      const batteryWeight = 1.0 - distanceWeight;

      const ranked = candidates
        .map((vehicle) => {
          const distance = distanceKm(task.origin, vehicle.position);
          const distanceScore = -distance / REFERENCE_DISTANCE_KM;
          const batteryScore = vehicle.battery / 100;

          const score = distanceWeight * distanceScore + batteryWeight * batteryScore;

          return {
            vehicle_id: vehicle.vehicle_id,
            score,
            reason: `priority-dispatch: priority=${task.priority} distance=${distance.toFixed(2)}km battery=${vehicle.battery}`,
          };
        })
        .sort((a, b) => b.score - a.score);

      return { ranked };
    },
  },
};
