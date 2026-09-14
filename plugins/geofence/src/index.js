'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { detectZoneTransition, isInsideZone } = require('./geofence');

/**
 * geofence 插件。
 * 订阅 telemetry.raw，检测车辆进出围栏，发 events.alerts。
 *
 * 阶段四：所有消息总线依赖通过 ctx 注入，不 require workspace 包。
 */

const vehicleZoneState = new Map();
let zones = [];
let bus = null;
let createEnvelope = null;
let TOPICS = null;
let metrics = null;

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
      if (ctx.bus) bus = ctx.bus;
      if (ctx.createEnvelope) createEnvelope = ctx.createEnvelope;
      if (ctx.topics) TOPICS = ctx.topics;
      if (ctx.metrics) metrics = ctx.metrics;

      ctx.logger.info(
        { count: zones.length, hasBus: !!bus, hasHelpers: !!createEnvelope && !!TOPICS },
        'geofence 插件已加载',
      );
    } catch (err) {
      ctx.logger.error({ err: err.message }, 'geofence 加载 zones.json 失败');
      zones = [];
    }
  },

  async onUnload() {
    vehicleZoneState.clear();
    zones = [];
    bus = null;
    createEnvelope = null;
    TOPICS = null;
    metrics = null;
  },

  async onMessage(_topic, envelope) {
    if (zones.length === 0) return;
    if (!bus || !createEnvelope || !TOPICS) return;

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

      try {
        await bus.publish(TOPICS.EVENTS_ALERTS, env, { partitionKey: vehicle_id });

        if (metrics) {
          metrics.geofenceEvents.inc({
            event_type: transition.type,
            level: transition.level,
          });
        }
      } catch (err) {
        if (metrics) {
          metrics.geofenceEvents.inc({
            event_type: transition.type,
            level: 'error',
          });
        }
        throw err;
      }
    }
  },

  async onTimer() {},

  getRoutes() {
    return [];
  },

  async getHealth() {
    return {
      status: zones.length > 0 ? 'ok' : 'degraded',
      message: `zones: ${zones.length}, hasBus: ${!!bus}`,
    };
  },

  // ============================================================
  // 测试辅助
  // ============================================================

  setBus(b) {
    bus = b;
  },

  /** 测试手动注入 helpers（绕过 ctx） */
  _setHelpers(helpers) {
    if (helpers.createEnvelope) createEnvelope = helpers.createEnvelope;
    if (helpers.topics) TOPICS = helpers.topics;
  },

  _getVehicleZoneState() {
    return vehicleZoneState;
  },

  _reset() {
    vehicleZoneState.clear();
    zones = [];
    bus = null;
    createEnvelope = null;
    TOPICS = null;
    metrics = null;
  },

  _getZones() {
    return zones;
  },
};
