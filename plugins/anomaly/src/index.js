'use strict';

const { detectAnomalies, DEFAULT_CONFIG } = require('./detectors');

/**
 * anomaly 插件。
 * 所有消息总线依赖通过 ctx 注入。
 */

const vehiclePrevState = new Map();
let config = { ...DEFAULT_CONFIG };
let bus = null;
let createEnvelope = null;
let TOPICS = null;

function extractTelemetry(envelope) {
  const p = envelope.payload;
  return {
    vehicle_id: p.vehicle_id,
    ts: p.ts,
    speed: p.speed,
    battery: p.battery,
  };
}

module.exports = {
  async onLoad(ctx) {
    const envConfig = ctx.config ?? {};
    config = {
      speedThresholdKmh: readFloatEnv(
        envConfig,
        'ANOMALY_SPEED_THRESHOLD_KMH',
        DEFAULT_CONFIG.speedThresholdKmh,
      ),
      batteryDropPercent: readFloatEnv(
        envConfig,
        'ANOMALY_BATTERY_DROP_PERCENT',
        DEFAULT_CONFIG.batteryDropPercent,
      ),
      batteryDropWindowMs: readIntEnv(
        envConfig,
        'ANOMALY_BATTERY_DROP_WINDOW_MS',
        DEFAULT_CONFIG.batteryDropWindowMs,
      ),
    };

    if (ctx.bus) bus = ctx.bus;
    if (ctx.createEnvelope) createEnvelope = ctx.createEnvelope;
    if (ctx.topics) TOPICS = ctx.topics;

    ctx.logger.info(
      { config, hasBus: !!bus, hasHelpers: !!createEnvelope && !!TOPICS },
      'anomaly 插件已加载',
    );
  },

  async onUnload() {
    vehiclePrevState.clear();
    bus = null;
    createEnvelope = null;
    TOPICS = null;
  },

  async onMessage(_topic, envelope) {
    const telemetry = extractTelemetry(envelope);
    const previous = vehiclePrevState.get(telemetry.vehicle_id) ?? null;

    const alerts = detectAnomalies({
      vehicleId: telemetry.vehicle_id,
      current: {
        ts: telemetry.ts,
        speed: telemetry.speed,
        battery: telemetry.battery,
      },
      previous,
      config,
    });

    vehiclePrevState.set(telemetry.vehicle_id, {
      battery: telemetry.battery,
      ts: telemetry.ts,
    });

    if (alerts.length === 0) return;
    if (!bus || !createEnvelope || !TOPICS) return;

    for (const alert of alerts) {
      const payload = {
        vehicle_id: telemetry.vehicle_id,
        alert_type: alert.alertType,
        level: alert.level,
        message: alert.message,
        payload: alert.payload,
      };

      const env = createEnvelope({
        topic: TOPICS.EVENTS_ALERTS,
        source: 'anomaly',
        payload,
      });

      await bus.publish(TOPICS.EVENTS_ALERTS, env, {
        partitionKey: telemetry.vehicle_id,
      });
    }
  },

  async onTimer() {},

  getRoutes() {
    return [];
  },

  async getHealth() {
    return {
      status: 'ok',
      message: `tracked vehicles: ${vehiclePrevState.size}, hasBus: ${!!bus}`,
    };
  },

  setBus(b) {
    bus = b;
  },

  _setHelpers(helpers) {
    if (helpers.createEnvelope) createEnvelope = helpers.createEnvelope;
    if (helpers.topics) TOPICS = helpers.topics;
  },

  _getVehiclePrevState() {
    return vehiclePrevState;
  },

  _getConfig() {
    return config;
  },

  _reset() {
    vehiclePrevState.clear();
    config = { ...DEFAULT_CONFIG };
    bus = null;
    createEnvelope = null;
    TOPICS = null;
  },
};

function readFloatEnv(config, name, fallback) {
  const raw = config?.[name] ?? process.env[name];
  if (raw === undefined) return fallback;
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) ? n : fallback;
}

function readIntEnv(config, name, fallback) {
  const raw = config?.[name] ?? process.env[name];
  if (raw === undefined) return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : fallback;
}
