'use strict';

/**
 * 最近邻调度算法。
 * 输入：{ task, candidates }
 * 输出：{ ranked: [{ vehicle_id, score, reason }] }
 * 得分规则：距离越近得分越高（score = -distanceKm）。
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine 距离（km）。
 */
function distanceKm(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

module.exports = {
  algorithm: {
    name: 'nearest',
    version: '1.0.0',

    rank(input) {
      const { task, candidates } = input;

      const ranked = candidates
        .map((vehicle) => {
          const distance = distanceKm(task.origin, vehicle.position);
          return {
            vehicle_id: vehicle.vehicle_id,
            score: -distance,
            reason: `nearest: distance=${distance.toFixed(2)}km`,
          };
        })
        .sort((a, b) => b.score - a.score);

      return { ranked };
    },
  },
};
