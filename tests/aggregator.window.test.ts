import { AggregationWindow, type TelemetryRawPayload } from '@apiscloud/aggregator';

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

describe('aggregator.window', () => {
  it('push 后 size 增加', () => {
    const w = new AggregationWindow();
    w.push(makeTelemetry('v-1'));
    w.push(makeTelemetry('v-2'));
    expect(w.size()).toBe(2);
  });

  it('同一车辆只保留最新一条', () => {
    const w = new AggregationWindow();
    w.push(makeTelemetry('v-1', { speed: 30 }));
    w.push(makeTelemetry('v-1', { speed: 50 }));
    expect(w.size()).toBe(1);
    const drained = w.drain();
    expect(drained[0].speed).toBe(50);
  });

  it('drain 返回所有快照并清空', () => {
    const w = new AggregationWindow();
    w.push(makeTelemetry('v-1'));
    w.push(makeTelemetry('v-2'));
    const drained = w.drain();
    expect(drained).toHaveLength(2);
    expect(w.size()).toBe(0);
  });

  it('clear 清空缓冲', () => {
    const w = new AggregationWindow();
    w.push(makeTelemetry('v-1'));
    w.clear();
    expect(w.size()).toBe(0);
  });
});
