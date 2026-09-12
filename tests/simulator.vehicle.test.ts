import { Vehicle, distanceKm, type SimulatorConfig } from '@apiscloud/simulator';

function makeConfig(overrides: Partial<SimulatorConfig> = {}): SimulatorConfig {
  return {
    vehicleCount: 1,
    publishIntervalMs: 1000,
    centerLat: 31.2304,
    centerLng: 121.4737,
    radiusKm: 30,
    minSpeed: 20,
    maxSpeed: 60,
    mqttTopic: 'telemetry/raw',
    ...overrides,
  };
}

describe('simulator.vehicle', () => {
  it('初始位置在运营半径内', () => {
    const config = makeConfig();
    const v = new Vehicle('v-000001', config);
    const state = v.getState();
    const d = distanceKm(
      { lat: config.centerLat, lng: config.centerLng },
      { lat: state.lat, lng: state.lng },
    );
    expect(d).toBeLessThanOrEqual(config.radiusKm * 1.01);
  });

  it('初始电量在 60-100 之间', () => {
    const v = new Vehicle('v-000001', makeConfig());
    expect(v.getState().battery).toBeGreaterThanOrEqual(60);
    expect(v.getState().battery).toBeLessThanOrEqual(100);
  });

  it('初始状态为 idle', () => {
    const v = new Vehicle('v-000001', makeConfig());
    expect(v.getState().status).toBe('idle');
  });

  it('getState 返回完整字段', () => {
    const v = new Vehicle('v-000001', makeConfig());
    const state = v.getState();
    expect(state.vehicle_id).toBe('v-000001');
    expect(typeof state.ts).toBe('number');
    expect(typeof state.lat).toBe('number');
    expect(typeof state.lng).toBe('number');
    expect(typeof state.speed).toBe('number');
    expect(typeof state.battery).toBe('number');
    expect(typeof state.heading).toBe('number');
    expect(state.status).toBeDefined();
  });

  it('多次 tick 后 ts 会更新', async () => {
    const v = new Vehicle('v-000001', makeConfig());
    const ts1 = v.tick(1).ts;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const ts2 = v.tick(1).ts;
    expect(ts2).toBeGreaterThanOrEqual(ts1);
  });

  it('idle 状态 speed 为 0', () => {
    const v = new Vehicle('v-000001', makeConfig());
    const state = v.tick(1);
    // 初始 idle，tick 后可能变 running 也可能保持 idle
    // 但第一次 tick 后，如果没有目标，speed 应为 0
    if (state.status === 'idle') {
      expect(state.speed).toBe(0);
    }
  });

  it('电量不会越界', () => {
    const v = new Vehicle('v-000001', makeConfig());
    for (let i = 0; i < 100; i++) {
      const state = v.tick(1);
      expect(state.battery).toBeGreaterThanOrEqual(0);
      expect(state.battery).toBeLessThanOrEqual(100);
    }
  });

  it('位置始终在合理经纬度范围', () => {
    const v = new Vehicle('v-000001', makeConfig());
    for (let i = 0; i < 100; i++) {
      const state = v.tick(1);
      expect(state.lat).toBeGreaterThan(-90);
      expect(state.lat).toBeLessThan(90);
      expect(state.lng).toBeGreaterThan(-180);
      expect(state.lng).toBeLessThan(180);
    }
  });

  it('航向在 0-360 之间', () => {
    const v = new Vehicle('v-000001', makeConfig());
    for (let i = 0; i < 100; i++) {
      const state = v.tick(1);
      expect(state.heading).toBeGreaterThanOrEqual(0);
      expect(state.heading).toBeLessThan(360);
    }
  });

  it('小车队：1000 次 tick 后电量下降或充电', () => {
    const v = new Vehicle('v-000001', makeConfig());
    const initialBattery = v.getState().battery;
    let sawRunning = false;
    let sawCharging = false;
    for (let i = 0; i < 1000; i++) {
      const state = v.tick(1);
      if (state.status === 'running') sawRunning = true;
      if (state.status === 'charging') sawCharging = true;
    }
    // 1000 秒内至少经历过一次行驶或充电
    expect(sawRunning || sawCharging || v.getState().battery !== initialBattery).toBe(true);
  });
});