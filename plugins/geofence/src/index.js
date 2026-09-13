'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createEnvelope, TOPICS } = require('@apiscloud/message-bus');
const { detectZoneTransition, isInsideZone } = require('./geofence');

/**
 * geofence 插件。
 * 订阅 telemetry.raw，检测车辆进出围栏，发 events.alerts。
 *
 * 阶段三只做插件代码 + 测试。
 * 阶段四由 plugin-host 注入 bus 后自动生效。
 */

/** 车辆最近一次是否在围栏内：Map<vehicle_id, Map<zone_id, boolean>> */
const vehicleZoneState = new Map();

/** 加载的围栏列表 */
let zones = [];

/** 总线（阶段四由 plugin-host 注入） */
let bus = null;

function loadZones() {
  const zonesPath = path.join(__dirname, '..', 'zones.json');
  const raw = fs.readFileSync(zonesPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.zones)) {
    throw new Error('zones.json 缺少 zones 数组');
  }
  return parsed.zones;
}

function extractTelemetry(envelope) {
  const p = envelope.payload;
  return {
    vehicle_id: p.vehicle_id,
    position: { lat: p.lat, lng: p.lng },
  };
}

function getPrevInside(vehicleId, zoneId) {
  const zoneStates = vehicleZoneState.get(vehicleId);
  if (!zoneStates) return null;
  const prev = zoneStates.get(zoneId);
  return prev === undefined ? null : prev;
}

function setCurrentInside(vehicleId, zoneId, inside) {
  let zoneStates = vehicleZoneState.get(vehicleId);
  if (!zoneStates) {
    zoneStates = new Map();
    vehicleZoneState.set(vehicleId, zoneStates);
  }
  zoneStates.set(zoneId, inside);
}

module.exports = {
  async onLoad(ctx) {
    try {
      zones = loadZones();
      ctx.logger.info({ count: zones.length }, 'geofence 插件已加载');
    } catch (err) {
      ctx.logger.error({ err: err.message }, 'geofence 加载 zones.json 失败');
      zones = [];
    }
  },

  async onUnload() {
    vehicleZoneState.clear();
    zones = [];
    bus = null;
  },

  async onMessage(_topic, envelope) {
    if (zones.length === 0) return;

    const { vehicle_id, position } = extractTelemetry(envelope);

    for (const zone of zones) {
      const prevInside = getPrevInside(vehicle_id, zone.id);
      const currentInside = isInsideZone(position, zone);

      const transition = detectZoneTransition({
        vehicleId: vehicle_id,
        position,
        prevInside,
        zone,
      });

      setCurrentInside(vehicle_id, zone.id, currentInside);

      if (!transition) continue;
      if (!bus || typeof bus.publish !== 'function') continue;

      const alertPayload = {
        vehicle_id,
        alert_type: transition.alertType,
        level: transition.level,
        message: transition.message,
        payload: {
          zone_id: transition.zoneId,
          zone_name: transition.zoneName,
        },
      };

      const env = createEnvelope({
        topic: TOPICS.EVENTS_ALERTS,
        source: 'geofence',
        payload: alertPayload,
      });

      await bus.publish(TOPICS.EVENTS_ALERTS, env, { partitionKey: vehicle_id });
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
      status: zones.length > 0 ? 'ok' : 'degraded',
      message: `zones: ${zones.length}`,
    };
  },

  // ============================================================
  // 阶段三测试辅助；阶段四接入 plugin-host 后可保留（用于注入）
  // ============================================================

  /** 阶段四由 plugin-host 在 onLoad 后调用，注入 bus */
  setBus(b) {
    bus = b;
  },

  /** 测试查看内部状态 */
  _getVehicleZoneState() {
    return vehicleZoneState;
  },

  /** 测试重置 */
  _reset() {
    vehicleZoneState.clear();
    zones = [];
    bus = null;
  },

  /** 测试读取 zones */
  _getZones() {
    return zones;
  },
};
