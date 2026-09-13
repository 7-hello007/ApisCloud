import { createLogger } from '@apiscloud/libs';
import { createEnvelope, TOPICS } from '@apiscloud/message-bus';
import type { ObservabilityMetrics } from '@apiscloud/observability';
import {
  handleEventsAlerts,
  handleTelemetryAggregated,
  handleTelemetryRaw,
  type PgWriter,
  type RedisWriter,
} from '@apiscloud/data-writer';

interface MockPgWriter extends PgWriter {
  readonly upsertCalls: unknown[][];
  readonly telemetryCalls: unknown[][];
  readonly alertCalls: unknown[][];
}

function createMockPgWriter(): MockPgWriter {
  const upsertCalls: unknown[][] = [];
  const telemetryCalls: unknown[][] = [];
  const alertCalls: unknown[][] = [];
  return {
    upsertCalls,
    telemetryCalls,
    alertCalls,
    async upsertVehicleLatest(t) {
      upsertCalls.push([t]);
    },
    async insertTelemetry(t) {
      telemetryCalls.push([t]);
    },
    async insertAlert(a) {
      alertCalls.push([a]);
    },
    async insertDispatchCommand() {
      // 该测试不涉及 dispatch_commands
    },
  };
}

interface MockRedisWriter extends RedisWriter {
  readonly latestCalls: unknown[][];
  readonly alertCalls: unknown[][];
  readonly regionCalls: unknown[][];
}

function createMockRedisWriter(): MockRedisWriter {
  const latestCalls: unknown[][] = [];
  const alertCalls: unknown[][] = [];
  const regionCalls: unknown[][] = [];
  return {
    latestCalls,
    alertCalls,
    regionCalls,
    async writeVehicleLatest(t, ttl) {
      latestCalls.push([t, ttl]);
    },
    async writeRecentAlert(a, max) {
      alertCalls.push([a, max]);
    },
    async writeRegionStats(a) {
      regionCalls.push([a]);
    },
  };
}

function createMockMetrics(): ObservabilityMetrics {
  return {
    dataFlowMessages: { inc: jest.fn() },
  } as unknown as ObservabilityMetrics;
}

describe('dataWriter.handlers', () => {
  const telemetry = {
    vehicle_id: 'v-000001',
    ts: Date.now(),
    lat: 31.23,
    lng: 121.47,
    speed: 30,
    battery: 80,
    heading: 90,
    status: 'running' as const,
  };

  const logger = createLogger({ service: 'test', level: 'silent' });
  const config = {
    vehicleLatestTtlSec: 60,
    recentAlertsMax: 100,
    consumerGroup: 'test',
  };

  describe('handleTelemetryRaw', () => {
    it('写 PG 和 Redis', async () => {
      const pgWriter = createMockPgWriter();
      const redisWriter = createMockRedisWriter();
      const metrics = createMockMetrics();
      const env = createEnvelope({
        topic: TOPICS.TELEMETRY_RAW,
        source: 'ingest',
        payload: telemetry,
      });

      await handleTelemetryRaw(env, {
        pgWriter,
        redisWriter,
        logger,
        metrics,
        config,
      });

      expect(pgWriter.upsertCalls).toHaveLength(1);
      expect(pgWriter.telemetryCalls).toHaveLength(1);
      expect(redisWriter.latestCalls).toHaveLength(1);
      expect(redisWriter.latestCalls[0][1]).toBe(60);
    });

    it('递增 dataFlowMessages 指标', async () => {
      const pgWriter = createMockPgWriter();
      const redisWriter = createMockRedisWriter();
      const metrics = createMockMetrics();
      const env = createEnvelope({
        topic: TOPICS.TELEMETRY_RAW,
        source: 'ingest',
        payload: telemetry,
      });

      await handleTelemetryRaw(env, {
        pgWriter,
        redisWriter,
        logger,
        metrics,
        config,
      });

      expect(metrics.dataFlowMessages.inc).toHaveBeenCalledWith({
        topic: TOPICS.TELEMETRY_RAW,
        direction: 'in',
      });
    });
  });

  describe('handleTelemetryAggregated', () => {
    it('写 Redis 区域统计', async () => {
      const redisWriter = createMockRedisWriter();
      const metrics = createMockMetrics();
      const env = createEnvelope({
        topic: TOPICS.TELEMETRY_AGGREGATED,
        source: 'aggregator',
        payload: {
          region: 'east',
          window_start: 1000,
          window_end: 2000,
          vehicle_count: 50,
          avg_speed: 35,
          avg_battery: 70,
        },
      });

      await handleTelemetryAggregated(env, {
        redisWriter,
        logger,
        metrics,
      });

      expect(redisWriter.regionCalls).toHaveLength(1);
    });

    it('递增指标', async () => {
      const redisWriter = createMockRedisWriter();
      const metrics = createMockMetrics();
      const env = createEnvelope({
        topic: TOPICS.TELEMETRY_AGGREGATED,
        source: 'aggregator',
        payload: {
          region: 'east',
          window_start: 1000,
          window_end: 2000,
          vehicle_count: 50,
          avg_speed: 35,
          avg_battery: 70,
        },
      });

      await handleTelemetryAggregated(env, { redisWriter, logger, metrics });

      expect(metrics.dataFlowMessages.inc).toHaveBeenCalledWith({
        topic: TOPICS.TELEMETRY_AGGREGATED,
        direction: 'in',
      });
    });
  });

  describe('handleEventsAlerts', () => {
    it('写 PG 和 Redis', async () => {
      const pgWriter = createMockPgWriter();
      const redisWriter = createMockRedisWriter();
      const metrics = createMockMetrics();
      const env = createEnvelope({
        topic: TOPICS.EVENTS_ALERTS,
        source: 'anomaly',
        payload: {
          vehicle_id: 'v-000001',
          alert_type: 'speed',
          level: 'warning',
          message: 'speed too high',
        },
      });

      await handleEventsAlerts(env, {
        pgWriter,
        redisWriter,
        logger,
        metrics,
        config,
      });

      expect(pgWriter.alertCalls).toHaveLength(1);
      expect(redisWriter.alertCalls).toHaveLength(1);
      expect(redisWriter.alertCalls[0][1]).toBe(100);
    });

    it('递增指标', async () => {
      const pgWriter = createMockPgWriter();
      const redisWriter = createMockRedisWriter();
      const metrics = createMockMetrics();
      const env = createEnvelope({
        topic: TOPICS.EVENTS_ALERTS,
        source: 'anomaly',
        payload: {
          vehicle_id: 'v-000001',
          alert_type: 'speed',
          level: 'warning',
          message: 'speed too high',
        },
      });

      await handleEventsAlerts(env, {
        pgWriter,
        redisWriter,
        logger,
        metrics,
        config,
      });

      expect(metrics.dataFlowMessages.inc).toHaveBeenCalledWith({
        topic: TOPICS.EVENTS_ALERTS,
        direction: 'in',
      });
    });
  });
});
