import { aggregate, type AggregateInput, type TelemetryRawPayload } from '@apiscloud/aggregator';

function makeTelemetry(
  vehicleId: string,
  overrides: Partial<TelemetryRawPayload> = {},
): TelemetryRawPayload {
  return {
    vehicle_id: vehicleId,
    ts: Date.now(),
    lat: 31.2304,
    lng: 121.4737,
    speed: 30,
    battery: 80,
    heading: 90,
    status: 'running',
    ...overrides,
  };
}

const BASE: Omit<AggregateInput, 'snapshots'> = {
  windowStart: 1000,
  windowEnd: 6000,
  region: 'test',
  regionCenter: { lat: 31.2304, lng: 121.4737 },
  lowBatteryThreshold: 20,
};

describe('aggregator.edgeCases', () => {
  describe('空列表', () => {
    it('返回全 0', () => {
      const result = aggregate({ ...BASE, snapshots: [] });
      expect(result.vehicle_count).toBe(0);
      expect(result.avg_speed).toBe(0);
      expect(result.avg_battery).toBe(0);
      expect(result.low_battery_vehicles).toEqual([]);
      expect(result.idle_vehicles).toEqual([]);
      expect(result.region).toBe('test');
      expect(result.region_center).toEqual({ lat: 31.2304, lng: 121.4737 });
    });
  });

  describe('低电量阈值边界', () => {
    it('battery = 20 不算低电量（严格小于）', () => {
      const result = aggregate({
        ...BASE,
        lowBatteryThreshold: 20,
        snapshots: [makeTelemetry('v-1', { battery: 20 })],
      });
      expect(result.low_battery_vehicles).toEqual([]);
    });

    it('battery = 19.99 算低电量', () => {
      const result = aggregate({
        ...BASE,
        lowBatteryThreshold: 20,
        snapshots: [makeTelemetry('v-1', { battery: 19.99 })],
      });
      expect(result.low_battery_vehicles).toEqual(['v-1']);
    });

    it('battery = 0 算低电量', () => {
      const result = aggregate({
        ...BASE,
        lowBatteryThreshold: 20,
        snapshots: [makeTelemetry('v-1', { battery: 0 })],
      });
      expect(result.low_battery_vehicles).toEqual(['v-1']);
    });

    it('battery = 100 不算', () => {
      const result = aggregate({
        ...BASE,
        lowBatteryThreshold: 20,
        snapshots: [makeTelemetry('v-1', { battery: 100 })],
      });
      expect(result.low_battery_vehicles).toEqual([]);
    });
  });

  describe('状态分类', () => {
    it('idle 车辆进入 idle_vehicles', () => {
      const result = aggregate({
        ...BASE,
        snapshots: [
          makeTelemetry('v-idle', { status: 'idle' }),
          makeTelemetry('v-run', { status: 'running' }),
          makeTelemetry('v-charge', { status: 'charging' }),
          makeTelemetry('v-off', { status: 'offline' }),
        ],
      });
      expect(result.idle_vehicles).toEqual(['v-idle']);
      expect(result.vehicle_count).toBe(4);
    });

    it('charging 不算 idle', () => {
      const result = aggregate({
        ...BASE,
        snapshots: [makeTelemetry('v-charge', { status: 'charging' })],
      });
      expect(result.idle_vehicles).toEqual([]);
    });
  });

  describe('浮点精度', () => {
    it('平均值保留 2 位小数', () => {
      const result = aggregate({
        ...BASE,
        snapshots: [
          makeTelemetry('v-1', { speed: 10, battery: 30 }),
          makeTelemetry('v-2', { speed: 20, battery: 40 }),
          makeTelemetry('v-3', { speed: 30, battery: 50 }),
        ],
      });
      // (10+20+30)/3 = 20
      expect(result.avg_speed).toBe(20);
      // (30+40+50)/3 = 40
      expect(result.avg_battery).toBe(40);
    });

    it('无法整除时四舍五入到 2 位', () => {
      const result = aggregate({
        ...BASE,
        snapshots: [
          makeTelemetry('v-1', { speed: 10, battery: 30 }),
          makeTelemetry('v-2', { speed: 20, battery: 40 }),
          makeTelemetry('v-3', { speed: 31, battery: 51 }),
        ],
      });
      // (10+20+31)/3 = 20.333 → 20.33
      expect(result.avg_speed).toBe(20.33);
      // (30+40+51)/3 = 40.333 → 40.33
      expect(result.avg_battery).toBe(40.33);
    });

    it('不会出现浮点误差（如 0.1 + 0.2）', () => {
      const result = aggregate({
        ...BASE,
        snapshots: [
          makeTelemetry('v-1', { speed: 0.1, battery: 0.1 }),
          makeTelemetry('v-2', { speed: 0.2, battery: 0.2 }),
        ],
      });
      // (0.1+0.2)/2 = 0.15（如果直接用浮点可能是 0.15000000000000002）
      expect(result.avg_speed).toBe(0.15);
    });
  });

  describe('大量车辆', () => {
    it('1000 辆车的平均值', () => {
      const snapshots: TelemetryRawPayload[] = [];
      for (let i = 0; i < 1000; i++) {
        snapshots.push(makeTelemetry(`v-${i}`, { speed: 30, battery: 50 }));
      }
      const result = aggregate({ ...BASE, snapshots });
      expect(result.vehicle_count).toBe(1000);
      expect(result.avg_speed).toBe(30);
      expect(result.avg_battery).toBe(50);
    });

    it('500 辆车中 100 辆低电量', () => {
      const snapshots: TelemetryRawPayload[] = [];
      for (let i = 0; i < 500; i++) {
        snapshots.push(makeTelemetry(`v-${i}`, { battery: i < 100 ? 10 : 80 }));
      }
      const result = aggregate({ ...BASE, snapshots });
      expect(result.low_battery_vehicles).toHaveLength(100);
    });
  });

  describe('区域和窗口信息', () => {
    it('保留 region 和 region_center', () => {
      const result = aggregate({
        ...BASE,
        region: 'east',
        regionCenter: { lat: 31.5, lng: 121.8 },
        snapshots: [],
      });
      expect(result.region).toBe('east');
      expect(result.region_center).toEqual({ lat: 31.5, lng: 121.8 });
    });

    it('保留 window_start 和 window_end', () => {
      const result = aggregate({
        ...BASE,
        windowStart: 1700000000000,
        windowEnd: 1700000005000,
        snapshots: [],
      });
      expect(result.window_start).toBe(1700000000000);
      expect(result.window_end).toBe(1700000005000);
    });
  });

  describe('混合场景', () => {
    it('低电量 + idle 车辆同时存在', () => {
      const result = aggregate({
        ...BASE,
        snapshots: [
          makeTelemetry('v-1', { battery: 10, status: 'idle' }),
          makeTelemetry('v-2', { battery: 80, status: 'running' }),
          makeTelemetry('v-3', { battery: 5, status: 'idle' }),
        ],
      });
      expect(result.low_battery_vehicles.sort()).toEqual(['v-1', 'v-3']);
      expect(result.idle_vehicles.sort()).toEqual(['v-1', 'v-3']);
      expect(result.vehicle_count).toBe(3);
    });
  });
});
