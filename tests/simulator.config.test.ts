import { loadConfig, resetConfig, type AppConfig } from '@apiscloud/libs';
import { loadSimulatorConfig } from '@apiscloud/simulator';

describe('simulator.config', () => {
  const ENV_KEYS = [
    'SIMULATOR_VEHICLE_COUNT',
    'SIMULATOR_PUBLISH_INTERVAL_MS',
    'SIMULATOR_CENTER_LAT',
    'SIMULATOR_CENTER_LNG',
    'SIMULATOR_RADIUS_KM',
    'SIMULATOR_MIN_SPEED',
    'SIMULATOR_MAX_SPEED',
    'SIMULATOR_MQTT_TOPIC',
  ];

  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    resetConfig();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  function getAppConfig(): AppConfig {
    return loadConfig();
  }

  it('默认值：500 辆车、1000ms、上海、30km', () => {
    const sim = loadSimulatorConfig(getAppConfig());
    expect(sim.vehicleCount).toBe(500);
    expect(sim.publishIntervalMs).toBe(1000);
    expect(sim.centerLat).toBeCloseTo(31.2304, 4);
    expect(sim.centerLng).toBeCloseTo(121.4737, 4);
    expect(sim.radiusKm).toBe(30);
    expect(sim.minSpeed).toBe(20);
    expect(sim.maxSpeed).toBe(60);
    expect(sim.mqttTopic).toBe('telemetry/raw');
  });

  it('环境变量可覆盖车辆数', () => {
    process.env.SIMULATOR_VEHICLE_COUNT = '100';
    const sim = loadSimulatorConfig(getAppConfig());
    expect(sim.vehicleCount).toBe(100);
  });

  it('环境变量可覆盖上报间隔', () => {
    process.env.SIMULATOR_PUBLISH_INTERVAL_MS = '2000';
    const sim = loadSimulatorConfig(getAppConfig());
    expect(sim.publishIntervalMs).toBe(2000);
  });

  it('环境变量可覆盖运营中心', () => {
    process.env.SIMULATOR_CENTER_LAT = '39.9042';
    process.env.SIMULATOR_CENTER_LNG = '116.4074';
    const sim = loadSimulatorConfig(getAppConfig());
    expect(sim.centerLat).toBeCloseTo(39.9042, 4);
    expect(sim.centerLng).toBeCloseTo(116.4074, 4);
  });

  it('环境变量可覆盖 MQTT topic', () => {
    process.env.SIMULATOR_MQTT_TOPIC = 'custom/topic';
    const sim = loadSimulatorConfig(getAppConfig());
    expect(sim.mqttTopic).toBe('custom/topic');
  });

  it('非法车辆数抛错', () => {
    process.env.SIMULATOR_VEHICLE_COUNT = 'abc';
    expect(() => loadSimulatorConfig(getAppConfig())).toThrow(/SIMULATOR_VEHICLE_COUNT/);
  });

  it('负数车辆数抛错', () => {
    process.env.SIMULATOR_VEHICLE_COUNT = '-1';
    expect(() => loadSimulatorConfig(getAppConfig())).toThrow(/SIMULATOR_VEHICLE_COUNT/);
  });

  it('0 车辆数抛错', () => {
    process.env.SIMULATOR_VEHICLE_COUNT = '0';
    expect(() => loadSimulatorConfig(getAppConfig())).toThrow(/SIMULATOR_VEHICLE_COUNT/);
  });

  it('非法浮点数抛错', () => {
    process.env.SIMULATOR_CENTER_LAT = 'abc';
    expect(() => loadSimulatorConfig(getAppConfig())).toThrow(/SIMULATOR_CENTER_LAT/);
  });

  it('未提供 appConfig 也不崩', () => {
    const sim = loadSimulatorConfig(getAppConfig());
    expect(sim).toBeDefined();
  });
});