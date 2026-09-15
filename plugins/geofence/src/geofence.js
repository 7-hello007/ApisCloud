'use strict';

/**
 * 地理围栏纯逻辑。
 * 不依赖 I/O，所有函数确定输入输出。
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

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * 判断点是否在圆形围栏内。
 * @param {{lat:number,lng:number}} point
 * @param {{type:'circle',center:{lat:number,lng:number},radiusKm:number}} zone
 * @returns {boolean}
 */
function isInsideZone(point, zone) {
  if (zone.type !== 'circle') {
    throw new Error(`不支持的围栏类型：${zone.type}`);
  }
  return distanceKm(point, zone.center) <= zone.radiusKm;
}

/**
 * 检测一条遥测是否触发围栏状态变化。
 * @param {object} params
 * @param {string} params.vehicleId
 * @param {{lat:number,lng:number}} params.position
 * @param {boolean|null} params.prevInside  上一次是否在围栏内（null 表示首次）
 * @param {object} params.zone
 * @returns {null | { type: 'enter'|'exit', zoneId: string, zoneName: string, alertType: string, level: 'info'|'warning', message: string }}
 */
function detectZoneTransition(params) {
  const { vehicleId, position, prevInside, zone } = params;
  const nowInside = isInsideZone(position, zone);

  // 首次观测不产生告警，只记录状态
  if (prevInside === null) {
    return null;
  }

  // 状态无变化
  if (prevInside === nowInside) {
    return null;
  }

  // 从内到外
  if (prevInside === true && nowInside === false && zone.alertOnExit) {
    return {
      type: 'exit',
      zoneId: zone.id,
      zoneName: zone.name,
      alertType: 'geofence_exit',
      level: 'warning',
      message: `车辆 ${vehicleId} 离开围栏「${zone.name}」`,
    };
  }

  // 从外到内
  if (prevInside === false && nowInside === true && zone.alertOnEnter) {
    return {
      type: 'enter',
      zoneId: zone.id,
      zoneName: zone.name,
      alertType: 'geofence_enter',
      level: 'info',
      message: `车辆 ${vehicleId} 进入围栏「${zone.name}」`,
    };
  }

  return null;
}

module.exports = {
  distanceKm,
  isInsideZone,
  detectZoneTransition,
};
