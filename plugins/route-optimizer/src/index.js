'use strict';

const {
  DEFAULT_LOW_SPEED_THRESHOLD,
  DEFAULT_SUGGESTED_SPEED,
  DEFAULT_COOLDOWN_MS,
  shouldOptimize,
  selectOptimizeCandidates,
  buildOptimizeCommand,
  pruneRecentCommands,
} = require('./optimizer');

/**
 * route-optimizer 插件。
 * 订阅 telemetry.raw（带 filter: status=running），
 * 检测低速车，发 events.commands（command_type: 'dispatch'）。
 */

/** 车辆 ID → 上次发指令时间戳 */
const recentCommands = new Map();

let bus = null;
let createEnvelope = null;
let TOPICS = null;
let lowSpeedThreshold = DEFAULT_LOW_SPEED_THRESHOLD;
let suggestedSpeed = DEFAULT_SUGGESTED_SPEED;
let cooldownMs = DEFAULT_COOLDOWN_MS;

module.exports = {
  async onLoad(ctx) {
    if (ctx.bus) bus = ctx.bus;
    if (ctx.createEnvelope) createEnvelope = ctx.createEnvelope;
    if (ctx.topics) TOPICS = ctx.topics;

    const cfg = ctx.config ?? {};
    lowSpeedThreshold = readIntEnv(
      cfg,
      'ROUTE_OPTIMIZER_LOW_SPEED_KMH',
      DEFAULT_LOW_SPEED_THRESHOLD,
    );
    suggestedSpeed = readIntEnv(
      cfg,
      'ROUTE_OPTIMIZER_SUGGESTED_SPEED_KMH',
      DEFAULT_SUGGESTED_SPEED,
    );
    cooldownMs = readIntEnv(cfg, 'ROUTE_OPTIMIZER_COOLDOWN_MS', DEFAULT_COOLDOWN_MS);

    ctx.logger.info(
      {
        lowSpeedThreshold,
        suggestedSpeed,
        cooldownMs,
        hasBus: !!bus,
        hasHelpers: !!createEnvelope && !!TOPICS,
      },
      'route-optimizer 已加载',
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

    const telemetry = envelope.payload;
    if (!shouldOptimize(telemetry, { lowSpeedThreshold })) return;

    const now = Date.now();
    pruneRecentCommands(recentCommands, now, cooldownMs * 2);

    const candidates = selectOptimizeCandidates({
      candidates: [telemetry.vehicle_id],
      recentCommands,
      now,
      cooldownMs,
    });

    if (candidates.length === 0) return;

    const cmd = buildOptimizeCommand(telemetry.vehicle_id, {
      currentSpeed: telemetry.speed,
      suggestedSpeed,
      now,
    });

    const env = createEnvelope({
      topic: TOPICS.EVENTS_COMMANDS,
      source: 'route-optimizer',
      payload: cmd,
    });

    await bus.publish(TOPICS.EVENTS_COMMANDS, env, {
      partitionKey: telemetry.vehicle_id,
    });

    recentCommands.set(telemetry.vehicle_id, now);
  },

  async onTimer() {},

  getRoutes() {
    return [];
  },

  async getHealth() {
    return {
      status: 'ok',
      message: `recent: ${recentCommands.size}, lowSpeed: ${lowSpeedThreshold}`,
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
    return { lowSpeedThreshold, suggestedSpeed, cooldownMs };
  },

  _reset() {
    recentCommands.clear();
    bus = null;
    createEnvelope = null;
    TOPICS = null;
    lowSpeedThreshold = DEFAULT_LOW_SPEED_THRESHOLD;
    suggestedSpeed = DEFAULT_SUGGESTED_SPEED;
    cooldownMs = DEFAULT_COOLDOWN_MS;
  },
};

function readIntEnv(config, name, fallback) {
  const raw = config?.[name] ?? process.env[name];
  if (raw === undefined) return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
