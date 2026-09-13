import { aggregate, type TelemetryRawPayload } from '@apiscloud/aggregator';

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

const BASE = {
  windowStart: 1000,
  windowEnd: 6000,
  region: 'test',
  regionCenter: { lat: 31.2304, lng: 121.4737 },
  lowBatteryThreshold: 20,
};

describe('aggregator.aggregate', () => {
  it('空列表返回 vehicle_count=0', () => {
    const result = aggregate({ ...BASE, snapshots: [] });
    expect(result.vehicle_count).toBe(0);
    expect(result.avg_speed).toBe(0);
    expect(result.avg_battery).toBe(0);
    expect(result.low_battery_vehicles).toEqual([]);
    expect(result.idle_vehicles).toEqual([]);
  });

  it('正确计算 avg_speed 和 avg_battery', () => {
    const result = aggregate({
      ...BASE,
      snapshots: [
        makeTelemetry('v-1', { speed: 20, battery: 80 }),
        makeTelemetry('v-2', { speed: 40, battery: 60 }),
      ],
    });
    expect(result.avg_speed).toBe(30);
    expect(result.avg_battery).toBe(70);
  });

  it('识别低电量车辆', () => {
    const result = aggregate({
      ...BASE,
      snapshots: [
        makeTelemetry('v-low1', { battery: 10 }),
        makeTelemetry('v-low2', { battery: 5 }),
        makeTelemetry('v-ok', { battery: 80 }),
      ],
    });
    expect(result.low_battery_vehicles.sort()).toEqual(['v-low1', 'v-low2']);
  });

  it('识别空闲车辆', () => {
    const result = aggregate({
      ...BASE,
      snapshots: [
        makeTelemetry('v-idle1', { status: 'idle' }),
        makeTelemetry('v-idle2', { status: 'idle' }),
        makeTelemetry('v-run', { status: 'running' }),
      ],
    });
    expect(result.idle_vehicles.sort()).toEqual(['v-idle1', 'v-idle2']);
  });

  it('低电量阈值可配置', () => {
    const result = aggregate({
      ...BASE,
      lowBatteryThreshold: 50,
      snapshots: [
        makeTelemetry('v-1', { battery: 40 }),
        makeTelemetry('v-2', { battery: 60 }),
      ],
    });
    expect(result.low_battery_vehicles).toEqual(['v-1']);
  });

  it('保留 region 和 window 信息', () => {
    const result = aggregate({ ...BASE, snapshots: [] });
    expect(result.region).toBe('test');
    expect(result.window_start).toBe(1000);
    expect(result.window_end).toBe(6000);
    expect(result.region_center).toEqual({ lat: 31.2304, lng: 121.4737 });
  });
});
