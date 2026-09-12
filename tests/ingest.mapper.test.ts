import {
  envelopeToCommand,
  telemetryToEnvelope,
} from '@apiscloud/ingest';
import { createEnvelope, TOPICS } from '@apiscloud/message-bus';

describe('ingest.mapper', () => {
  describe('telemetryToEnvelope', () => {
    it('生成的信封 topic 为 telemetry.raw', () => {
      const env = telemetryToEnvelope({
        vehicle_id: 'v-000001',
        ts: Date.now(),
        lat: 31.23,
        lng: 121.47,
        speed: 30,
        battery: 80,
        heading: 90,
        status: 'running',
      });
      expect(env.topic).toBe(TOPICS.TELEMETRY_RAW);
    });

    it('生成的信封 source 为 ingest', () => {
      const env = telemetryToEnvelope({
        vehicle_id: 'v-000001',
        ts: Date.now(),
        lat: 31.23,
        lng: 121.47,
        speed: 30,
        battery: 80,
        heading: 90,
        status: 'running',
      });
      expect(env.source).toBe('ingest');
    });

    it('payload 与输入一致', () => {
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
      const env = telemetryToEnvelope(telemetry);
      expect(env.payload).toEqual(telemetry);
    });

    it('自动生成 trace_id 和 span_id', () => {
      const env = telemetryToEnvelope({
        vehicle_id: 'v-000001',
        ts: Date.now(),
        lat: 31.23,
        lng: 121.47,
        speed: 30,
        battery: 80,
        heading: 90,
        status: 'running',
      });
      expect(env.trace_id).toBeDefined();
      expect(env.span_id).toBeDefined();
    });
  });

  describe('envelopeToCommand', () => {
    it('提取 payload 作为命令', () => {
      const cmd = {
        vehicle_id: 'v-000001',
        command_id: 'cmd-1',
        command_type: 'dispatch',
        payload: { lat: 31.2, lng: 121.4 },
      };
      const env = createEnvelope({
        topic: TOPICS.EVENTS_COMMANDS,
        source: 'dispatch-core',
        payload: cmd,
      });
      const result = envelopeToCommand(env);
      expect(result).toEqual(cmd);
    });
  });
});
