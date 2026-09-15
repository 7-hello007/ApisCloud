'use strict';

const { randomUUID } = require('node:crypto');

/**
 * 充电调度纯逻辑。
 * 不依赖 I/O，所有函数确定输入输出。
 */

/** 默认冷却时间（毫秒）：同一车 5 分钟内不重复发充电指令 */
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

/** 默认低电量阈值（%） */
const DEFAULT_LOW_BATTERY_THRESHOLD = 20;

/**
 * 从候选列表中过滤出需要发指令的车辆。
 * 过滤规则：不在冷却期内。
 *
 * @param {object} params
 * @param {string[]} params.lowBatteryVehicles  低电量车辆 ID 列表
 * @param {Map<string, number>} params.recentCommands  车辆 ID → 上次发指令时间戳
 * @param {number} params.now  当前时间戳
 * @param {number} [params.cooldownMs]  冷却时间
 * @returns {string[]}
 */
function selectChargingCandidates(params) {
  const { lowBatteryVehicles, recentCommands, now, cooldownMs = DEFAULT_COOLDOWN_MS } = params;

  return lowBatteryVehicles.filter((vehicleId) => {
    const last = recentCommands.get(vehicleId);
    if (last === undefined) return true;
    return now - last > cooldownMs;
  });
}

/**
 * 构建充电指令。
 * 结构与 ingest 的 DownlinkCommand 一致。
 *
 * @param {string} vehicleId
 * @param {object} options
 * @param {number} options.threshold  低电量阈值
 * @param {number} options.now        签发时间戳
 * @returns {object}
 */
function buildChargeCommand(vehicleId, options) {
  const { threshold, now } = options;

  return {
    vehicle_id: vehicleId,
    command_id: randomUUID(),
    command_type: 'charge',
    payload: {
      reason: 'low_battery',
      threshold,
      issued_at: now,
    },
  };
}

/**
 * 清理过期的冷却记录。
 * 超过 maxAgeMs 的条目删除，避免 Map 无限增长。
 *
 * @param {Map<string, number>} recentCommands
 * @param {number} now
 * @param {number} maxAgeMs
 */
function pruneRecentCommands(recentCommands, now, maxAgeMs) {
  for (const [id, ts] of recentCommands.entries()) {
    if (now - ts > maxAgeMs) {
      recentCommands.delete(id);
    }
  }
}

module.exports = {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_LOW_BATTERY_THRESHOLD,
  selectChargingCandidates,
  buildChargeCommand,
  pruneRecentCommands,
};
