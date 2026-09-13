'use strict';

/**
 * 异常检测纯逻辑。
 * 不依赖 I/O，所有函数确定输入输出。
 */

/** 默认配置 */
const DEFAULT_CONFIG = {
  speedThresholdKmh: 120,
  batteryDropPercent: 15,
  batteryDropWindowMs: 30_000,
};

/**
 * 速度超阈值检测。
 * @returns {null | { alertType: 'speed_anomaly', level: 'warning', message: string, payload: object }}
 */
function checkSpeed(vehicleId, speed, config = {}) {
  const threshold = config.speedThresholdKmh ?? DEFAULT_CONFIG.speedThresholdKmh;
  if (speed <= threshold) return null;
  return {
    alertType: 'speed_anomaly',
    level: 'warning',
    message: `车辆 ${vehicleId} 速度异常：${speed.toFixed(1)} km/h > ${threshold} km/h`,
    payload: { speed, threshold },
  };
}

/**
 * 电量骤降检测。
 * @param {number} currentBattery
 * @param {{battery:number, ts:number}|null} previous  上一次状态
 * @param {number} currentTs
 * @returns {null | { alertType: 'battery_drop', level: 'critical', message: string, payload: object }}
 */
function checkBatteryDrop(vehicleId, currentBattery, previous, currentTs, config = {}) {
  if (!previous) return null;

  const dropThreshold = config.batteryDropPercent ?? DEFAULT_CONFIG.batteryDropPercent;
  const windowMs = config.batteryDropWindowMs ?? DEFAULT_CONFIG.batteryDropWindowMs;

  const timeDelta = currentTs - previous.ts;
  if (timeDelta < 0 || timeDelta > windowMs) return null;

  const drop = previous.battery - currentBattery;
  if (drop < dropThreshold) return null;

  return {
    alertType: 'battery_drop',
    level: 'critical',
    message: `车辆 ${vehicleId} 电量骤降：${drop.toFixed(1)}%（${previous.battery}% → ${currentBattery}%），时间窗 ${(timeDelta / 1000).toFixed(1)}s`,
    payload: {
      previousBattery: previous.battery,
      currentBattery,
      drop,
      windowMs: timeDelta,
    },
  };
}

/**
 * 综合检测。
 * @returns {Array<{alertType:string,level:string,message:string,payload:object}>}
 */
function detectAnomalies(params) {
  const { vehicleId, current, previous, config } = params;
  const alerts = [];

  const speedAlert = checkSpeed(vehicleId, current.speed, config);
  if (speedAlert) alerts.push(speedAlert);

  const batteryAlert = checkBatteryDrop(
    vehicleId,
    current.battery,
    previous,
    current.ts,
    config,
  );
  if (batteryAlert) alerts.push(batteryAlert);

  return alerts;
}

module.exports = {
  DEFAULT_CONFIG,
  checkSpeed,
  checkBatteryDrop,
  detectAnomalies,
};
