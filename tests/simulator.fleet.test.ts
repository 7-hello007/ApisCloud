import { Fleet, type SimulatorConfig } from '@apiscloud/simulator';

function makeConfig(overrides: Partial<SimulatorConfig> = {}): SimulatorConfig {
  return {
    vehicleCount: 10,
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

describe('simulator.fleet', () => {
  it('初始化指定数量的车辆', () => {
    const fleet = new Fleet(makeConfig({ vehicleCount: 50 }));
    expect(fleet.size()).toBe(50);
  });

  it('车辆 ID 格式为 v-NNNNNN', () => {
    const fleet = new Fleet(makeConfig({ vehicleCount: 5 }));
    const states = fleet.tick(1);
    expect(states[0].vehicle_id).toBe('v-000001');
    expect(states[1].vehicle_id).toBe('v-000002');
    expect(states[2].vehicle_id).toBe('v-000003');
    expect(states[3].vehicle_id).toBe('v-000004');
    expect(states[4].vehicle_id).toBe('v-000005');
  });

  it('tick 返回所有车辆的状态', () => {
    const fleet = new Fleet(makeConfig({ vehicleCount: 20 }));
    const states = fleet.tick(1);
    expect(states).toHaveLength(20);
  });

  it('所有车辆 ID 唯一', () => {
    const fleet = new Fleet(makeConfig({ vehicleCount: 100 }));
    const states = fleet.tick(1);
    const ids = new Set(states.map((s) => s.vehicle_id));
    expect(ids.size).toBe(100);
  });

  it('500 辆车可正常 tick', () => {
    const fleet = new Fleet(makeConfig({ vehicleCount: 500 }));
    const states = fleet.tick(1);
    expect(states).toHaveLength(500);
  });

  it('连续 tick 不崩溃', () => {
    const fleet = new Fleet(makeConfig({ vehicleCount: 20 }));
    for (let i = 0; i < 50; i++) {
      const states = fleet.tick(1);
      expect(states).toHaveLength(20);
    }
  });

  it('每辆车状态字段完整', () => {
    const fleet = new Fleet(makeConfig({ vehicleCount: 5 }));
    const states = fleet.tick(1);
    for (const state of states) {
      expect(state.vehicle_id).toBeDefined();
      expect(state.ts).toBeGreaterThan(0);
      expect(state.lat).toBeDefined();
      expect(state.lng).toBeDefined();
      expect(state.speed).toBeGreaterThanOrEqual(0);
      expect(state.battery).toBeGreaterThanOrEqual(0);
      expect(state.heading).toBeGreaterThanOrEqual(0);
      expect(state.status).toBeDefined();
    }
  });
});