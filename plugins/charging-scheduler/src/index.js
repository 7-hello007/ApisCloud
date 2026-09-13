'use strict';

const {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_LOW_BATTERY_THRESHOLD,
  selectChargingCandidates,
  buildChargeCommand,
  pruneRecentCommands,
} = require('./detectors');

/**
 * charging-scheduler 插件。
 * 订阅 telemetry.aggregated，从 low_battery_vehicles 拿候选，
 * 发 events.commands（command_type: 'charge'）。
 *
 * 所有消息总线依赖通过 ctx 注入，不 require workspace 包。
 */

/** 车辆 ID → 上次发指令时间戳 */
const recentCommands = new Map();

let bus = null;
let createEnvelope = null;
let TOPICS = null;
let lowBatteryThreshold = DEFAULT_LOW_BATTERY_THRESHOLD;
let cooldownMs = DEFAULT_COOLDOWN_MS;

module.exports = {
  async onLoad(ctx) {
    if (ctx.bus) bus = ctx.bus;
    if (ctx.createEnvelope) createEnvelope = ctx.createEnvelope;
    if (ctx.topics) TOPICS = ctx.topics;

    const cfg = ctx.config ?? {};
    lowBatteryThreshold = readIntEnv(
      cfg,
      'CHARGING_LOW_BATTERY_THRESHOLD',
      DEFAULT_LOW_BATTERY_THRESHOLD,
    );
    cooldownMs = readIntEnv(cfg, 'CHARGING_COOLDOWN_MS', DEFAULT_COOLDOWN_MS);

    ctx.logger.info(
      {
        lowBatteryThreshold,
        cooldownMs,
        hasBus: !!bus,
        hasHelpers: !!createEnvelope && !!TOPICS,
      },
      'charging-scheduler 已加载',
    );
  },

  async onUnload() {
    recentCommands.clear();
    bus = null;
    createEnvelope = null;
    TOPICS = null;
  },

  async onMessage(_topic, envelope) {
    if (!bus || !createEnvelope || !TOPICS) return;

    const payload = envelope.payload;
    const lowBatteryVehicles = payload?.low_battery_vehicles ?? [];
    if (lowBatteryVehicles.length === 0) return;

    const now = Date.now();

    // 清理过期冷却记录
    pruneRecentCommands(recentCommands, now, cooldownMs * 2);

    // 过滤候选
    const candidates = selectChargingCandidates({
      lowBatteryVehicles,
      recentCommands,
      now,
      cooldownMs,
    });

    if (candidates.length === 0) return;

    for (const vehicleId of candidates) {
      const cmd = buildChargeCommand(vehicleId, {
        threshold: lowBatteryThreshold,
        now,
      });

      const env = createEnvelope({
        topic: TOPICS.EVENTS_COMMANDS,
        source: 'charging-scheduler',
        payload: cmd,
      });

      await bus.publish(TOPICS.EVENTS_COMMANDS, env, {
        partitionKey: vehicleId,
      });

      recentCommands.set(vehicleId, now);
    }
  },

  async onTimer() {},

  getRoutes() {
    return [];
  },

  async getHealth() {
    return {
      status: 'ok',
      message: `recent: ${recentCommands.size}, threshold: ${lowBatteryThreshold}, cooldown: ${cooldownMs}`,
    };
  },

  // ============================================================
  // 测试辅助
  // ============================================================

  setBus(b) {
    bus = b;
  },

  _setHelpers(helpers) {
    if (helpers.createEnvelope) createEnvelope = helpers.createEnvelope;
    if (helpers.topics) TOPICS = helpers.topics;
  },

  _getRecentCommands() {
    return recentCommands;
  },

  _getConfig() {
    return { lowBatteryThreshold, cooldownMs };
  },

  _reset() {
    recentCommands.clear();
    bus = null;
    createEnvelope = null;
    TOPICS = null;
    lowBatteryThreshold = DEFAULT_LOW_BATTERY_THRESHOLD;
    cooldownMs = DEFAULT_COOLDOWN_MS;
  },
};

function readIntEnv(config, name, fallback) {
  const raw = config?.[name] ?? process.env[name];
  if (raw === undefined) return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
