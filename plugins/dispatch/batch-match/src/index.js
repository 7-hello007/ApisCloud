'use strict';

/**
 * 批量匹配算法。
 * 对单个任务的多因素成本最小化：
 *   成本 = distanceCost - w_battery * batteryScore - w_capability * capabilityScore
 * 得分 = -成本，越大越好。
 *
 * 说明：dispatch-core 当前一次传一个任务。
 * 未来若扩展为一批任务，本插件可改为匈牙利算法 / 最小成本流。
 */

const EARTH_RADIUS_KM = 6371;

/** 距离归一化参考值（km） */
const REFERENCE_DISTANCE_KM = 50;

/** 电量加成权重 */
const W_BATTERY = 0.3;

/** 能力匹配加成权重 */
const W_CAPABILITY = 0.2;

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
    name: 'batch-match',
    version: '1.0.0',

    rank(input) {
      const { task, candidates } = input;

      const ranked = candidates
        .map((vehicle) => {
          const distance = distanceKm(task.origin, vehicle.position);
          const distanceCost = distance / REFERENCE_DISTANCE_KM;
          const batteryScore = vehicle.battery / 100;

          // capabilities 未声明视为通用，能力加成满分
          let capabilityScore = 1;
          if (vehicle.capabilities && vehicle.capabilities.length > 0) {
            capabilityScore = vehicle.capabilities.includes(task.task_type) ? 1 : 0;
          }

          const cost = distanceCost - W_BATTERY * batteryScore - W_CAPABILITY * capabilityScore;
          const score = -cost;

          return {
            vehicle_id: vehicle.vehicle_id,
            score,
            reason: `batch-match: cost=${cost.toFixed(3)} distance=${distance.toFixed(2)}km battery=${vehicle.battery}`,
          };
        })
        .sort((a, b) => b.score - a.score);

      return { ranked };
    },
  },
};
