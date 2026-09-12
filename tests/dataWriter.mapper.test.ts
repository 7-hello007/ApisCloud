import {
  alertToPgParams,
  extractAlert,
  extractTelemetryAggregated,
  extractTelemetryRaw,
  telemetryToLatestParams,
  telemetryToPgParams,
} from '@apiscloud/data-writer';
import { createEnvelope, TOPICS } from '@apiscloud/message-bus';

describe('dataWriter.mapper', () => {
  const telemetry = {
    vehicle_id: 'v-000001',
    ts: 1757668800000,
    lat: 31.23,
    lng: 121.47,
    speed: 30,
    battery: 80,
    heading: 90,
    status: 'running' as const,
  };

  describe('extractTelemetryRaw', () => {
    it('从 Envelope 提取 payload', () => {
      const env = createEnvelope({
        topic: TOPICS.TELEMETRY_RAW,
        source: 'ingest',
        payload: telemetry,
      });
      expect(extractTelemetryRaw(env)).toEqual(telemetry);
    });
  });

  describe('extractTelemetryAggregated', () => {
    it('从 Envelope 提取聚合 payload', () => {
      const agg = {
        region: 'east',
        window_start: 1000,
        window_end: 2000,
        vehicle_count: 50,
        avg_speed: 35,
        avg_battery: 70,
      };
      const env = createEnvelope({
        topic: TOPICS.TELEMETRY_AGGREGATED,
        source: 'aggregator',
        payload: agg,
      });
      expect(extractTelemetryAggregated(env)).toEqual(agg);
    });
  });

  describe('extractAlert', () => {
    it('从 Envelope 提取告警 payload', () => {
      const alert = {
        vehicle_id: 'v-000001',
        alert_type: 'speed',
        level: 'warning' as const,
        message: 'speed too high',
      };
      const env = createEnvelope({
        topic: TOPICS.EVENTS_ALERTS,
        source: 'anomaly',
        payload: alert,
      });
      expect(extractAlert(env)).toEqual(alert);
    });
  });

  describe('telemetryToPgParams', () => {
    it('返回 8 个参数', () => {
      const params = telemetryToPgParams(telemetry);
      expect(params).toHaveLength(8);
    });

    it('第一个参数是 vehicle_id', () => {
      const params = telemetryToPgParams(telemetry);
      expect(params[0]).toBe('v-000001');
    });

    it('第二个参数是 ISO 时间字符串', () => {
      const params = telemetryToPgParams(telemetry);
      expect(typeof params[1]).toBe('string');
      expect(params[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('最后一个参数是 JSON 字符串', () => {
      const params = telemetryToPgParams(telemetry);
      expect(typeof params[7]).toBe('string');
      expect(JSON.parse(params[7] as string)).toEqual(telemetry);
    });
  });

  describe('telemetryToLatestParams', () => {
    it('返回 7 个参数', () => {
      const params = telemetryToLatestParams(telemetry);
      expect(params).toHaveLength(7);
    });

    it('顺序：vehicle_id, status, battery, lat, lng, heading, speed', () => {
      const params = telemetryToLatestParams(telemetry);
      expect(params).toEqual([
        'v-000001',
        'running',
        80,
        31.23,
        121.47,
        90,
        30,
      ]);
    });
  });

  describe('alertToPgParams', () => {
    it('返回 5 个参数', () => {
      const params = alertToPgParams({
        vehicle_id: 'v-000001',
        alert_type: 'speed',
        level: 'warning',
        message: 'speed too high',
      });
      expect(params).toHaveLength(5);
    });

    it('无 payload 时第 5 个参数为 null', () => {
      const params = alertToPgParams({
        vehicle_id: 'v-000001',
        alert_type: 'speed',
        level: 'warning',
        message: 'speed too high',
      });
      expect(params[4]).toBeNull();
    });

    it('有 payload 时序列化为 JSON', () => {
      const params = alertToPgParams({
        vehicle_id: 'v-000001',
        alert_type: 'speed',
        level: 'warning',
        message: 'speed too high',
        payload: { limit: 60, actual: 80 },
      });
      expect(typeof params[4]).toBe('string');
      expect(JSON.parse(params[4] as string)).toEqual({ limit: 60, actual: 80 });
    });
  });
});
