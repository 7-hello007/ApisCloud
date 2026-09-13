'use strict';

const { createEnvelope, TOPICS } = require('@apiscloud/message-bus');
const { detectAnomalies, DEFAULT_CONFIG } = require('./detectors');

/**
 * anomaly 插件。
 * 订阅 telemetry.raw，检测速度异常和电量骤降，发 events.alerts。
 *
 * 阶段三只做插件代码 + 测试。
 * 阶段四由 plugin-host 注入 bus 后自动生效。
 */

/** 车辆上一状态：Map<vehicle_id, { battery:number, ts:number }> */
const vehiclePrevState = new Map();

/** 检测配置 */
let config = { ...DEFAULT_CONFIG };

/** 总线（阶段四由 plugin-host 注入） */
let bus = null;

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
    ctx.logger.info({ config }, 'anomaly 插件已加载');
  },

  async onUnload() {
    vehiclePrevState.clear();
    bus = null;
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

    // 更新上一状态
    vehiclePrevState.set(telemetry.vehicle_id, {
      battery: telemetry.battery,
      ts: telemetry.ts,
    });

    if (alerts.length === 0) return;
    if (!bus || typeof bus.publish !== 'function') return;

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

  async onTimer() {
    // 无定时任务
  },

  getRoutes() {
    return [];
  },

  async getHealth() {
    return {
      status: 'ok',
      message: `tracked vehicles: ${vehiclePrevState.size}`,
    };
  },

  // ============================================================
  // 阶段三测试辅助
  // ============================================================

  setBus(b) {
    bus = b;
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
