import {
  DownlinkCommandSchema,
  UplinkTelemetrySchema,
} from '@apiscloud/ingest';

describe('ingest.validation', () => {
  describe('UplinkTelemetrySchema', () => {
    function validTelemetry() {
      return {
        vehicle_id: 'v-000001',
        ts: Date.now(),
        lat: 31.23,
        lng: 121.47,
        speed: 30,
        battery: 80,
        heading: 90,
        status: 'running' as const,
      };
    }

    it('接受合法遥测', () => {
      const result = UplinkTelemetrySchema.safeParse(validTelemetry());
      expect(result.success).toBe(true);
    });

    it('拒绝缺少 vehicle_id', () => {
      const { vehicle_id: _drop, ...rest } = validTelemetry();
      const result = UplinkTelemetrySchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('拒绝空 vehicle_id', () => {
      const result = UplinkTelemetrySchema.safeParse({
        ...validTelemetry(),
        vehicle_id: '',
      });
      expect(result.success).toBe(false);
    });

    it('拒绝非整数 ts', () => {
      const result = UplinkTelemetrySchema.safeParse({
        ...validTelemetry(),
        ts: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it('拒绝负 ts', () => {
      const result = UplinkTelemetrySchema.safeParse({
        ...validTelemetry(),
        ts: -1,
      });
      expect(result.success).toBe(false);
    });

    it('拒绝纬度超出范围', () => {
      const result = UplinkTelemetrySchema.safeParse({
        ...validTelemetry(),
        lat: 100,
      });
      expect(result.success).toBe(false);
    });

    it('拒绝经度超出范围', () => {
      const result = UplinkTelemetrySchema.safeParse({
        ...validTelemetry(),
        lng: 200,
      });
      expect(result.success).toBe(false);
    });

    it('拒绝负速度', () => {
      const result = UplinkTelemetrySchema.safeParse({
        ...validTelemetry(),
        speed: -1,
      });
      expect(result.success).toBe(false);
    });

    it('拒绝电量超过 100', () => {
      const result = UplinkTelemetrySchema.safeParse({
        ...validTelemetry(),
        battery: 101,
      });
      expect(result.success).toBe(false);
    });

    it('拒绝航向超过 360', () => {
      const result = UplinkTelemetrySchema.safeParse({
        ...validTelemetry(),
        heading: 361,
      });
      expect(result.success).toBe(false);
    });

    it('拒绝未知状态', () => {
      const result = UplinkTelemetrySchema.safeParse({
        ...validTelemetry(),
        status: 'unknown',
      });
      expect(result.success).toBe(false);
    });

    it('接受所有合法状态', () => {
      const statuses = ['idle', 'running', 'charging', 'maintenance', 'offline'];
      for (const status of statuses) {
        const result = UplinkTelemetrySchema.safeParse({
          ...validTelemetry(),
          status,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('DownlinkCommandSchema', () => {
    function validCommand() {
      return {
        vehicle_id: 'v-000001',
        command_id: 'cmd-1',
        command_type: 'dispatch',
        payload: { lat: 31.2, lng: 121.4 },
      };
    }

    it('接受合法命令', () => {
      const result = DownlinkCommandSchema.safeParse(validCommand());
      expect(result.success).toBe(true);
    });

    it('拒绝缺少 vehicle_id', () => {
      const { vehicle_id: _drop, ...rest } = validCommand();
      const result = DownlinkCommandSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('拒绝空 command_id', () => {
      const result = DownlinkCommandSchema.safeParse({
        ...validCommand(),
        command_id: '',
      });
      expect(result.success).toBe(false);
    });

    it('拒绝空 command_type', () => {
      const result = DownlinkCommandSchema.safeParse({
        ...validCommand(),
        command_type: '',
      });
      expect(result.success).toBe(false);
    });

    it('接受任意 payload', () => {
      const result = DownlinkCommandSchema.safeParse({
        ...validCommand(),
        payload: { any: 'thing', nested: { a: 1 } },
      });
      expect(result.success).toBe(true);
    });

    it('接受 null payload', () => {
      const result = DownlinkCommandSchema.safeParse({
        ...validCommand(),
        payload: null,
      });
      expect(result.success).toBe(true);
    });
  });
});
