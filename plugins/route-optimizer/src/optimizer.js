'use strict';

const { randomUUID } = require('node:crypto');

/**
 * 路线优化纯逻辑。
 */

/** 低速阈值（km/h）：低于此速度的 running 车视为可能拥堵 */
const DEFAULT_LOW_SPEED_THRESHOLD = 15;

/** 建议提升到的速度（km/h） */
const DEFAULT_SUGGESTED_SPEED = 40;

/** 默认冷却时间（毫秒）：同一车 3 分钟内不重复发指令 */
const DEFAULT_COOLDOWN_MS = 3 * 60 * 1000;

/**
 * 判断一条遥测是否触发优化。
 *
 * @param {object} telemetry
 * @param {object} options
 * @param {number} [options.lowSpeedThreshold]
 * @returns {boolean}
 */
function shouldOptimize(telemetry, options = {}) {
  const threshold = options.lowSpeedThreshold ?? DEFAULT_LOW_SPEED_THRESHOLD;
  return telemetry.status === 'running' && telemetry.speed < threshold;
}

/**
 * 过滤候选车辆。
 * 只保留不在冷却期内的。
 *
 * @param {object} params
 * @param {string[]} params.candidates
 * @param {Map<string, number>} params.recentCommands
 * @param {number} params.now
 * @param {number} [params.cooldownMs]
 * @returns {string[]}
 */
function selectOptimizeCandidates(params) {
  const {
    candidates,
    recentCommands,
    now,
    cooldownMs = DEFAULT_COOLDOWN_MS,
  } = params;

  return candidates.filter((vehicleId) => {
    const last = recentCommands.get(vehicleId);
    if (last === undefined) return true;
    return now - last > cooldownMs;
  });
}

/**
 * 构建优化指令。
 * 结构与 ingest 的 DownlinkCommand 一致。
 *
 * @param {string} vehicleId
 * @param {object} options
 * @param {number} options.currentSpeed
 * @param {number} options.suggestedSpeed
 * @param {number} options.now
 * @returns {object}
 */
function buildOptimizeCommand(vehicleId, options) {
  const { currentSpeed, suggestedSpeed, now } = options;

  return {
    vehicle_id: vehicleId,
    command_id: randomUUID(),
    command_type: 'dispatch',
    payload: {
      reason: 'route_optimize',
      optimization: 'speed_boost',
      current_speed: currentSpeed,
      suggested_speed: suggestedSpeed,
      issued_at: now,
    },
  };
}

/**
 * 清理过期冷却记录。
 */
function pruneRecentCommands(recentCommands, now, maxAgeMs) {
  for (const [id, ts] of recentCommands.entries()) {
    if (now - ts > maxAgeMs) {
      recentCommands.delete(id);
    }
  }
}

module.exports = {
  DEFAULT_LOW_SPEED_THRESHOLD,
  DEFAULT_SUGGESTED_SPEED,
  DEFAULT_COOLDOWN_MS,
  shouldOptimize,
  selectOptimizeCandidates,
  buildOptimizeCommand,
  pruneRecentCommands,
};
