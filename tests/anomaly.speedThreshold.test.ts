/* eslint-disable @typescript-eslint/no-require-imports */
const {
  checkSpeed,
  checkBatteryDrop,
  detectAnomalies,
  DEFAULT_CONFIG,
} = require('../plugins/anomaly/src/detectors.js');

describe('anomaly.speedThreshold', () => {
  describe('checkSpeed', () => {
    it('速度正常返回 null', () => {
      expect(checkSpeed('v-1', 60)).toBeNull();
    });

    it('速度等于阈值返回 null', () => {
      expect(checkSpeed('v-1', 120)).toBeNull();
    });

    it('速度超过阈值产生告警', () => {
      const result = checkSpeed('v-1', 150);
      expect(result).not.toBeNull();
      expect(result.alertType).toBe('speed_anomaly');
      expect(result.level).toBe('warning');
      expect(result.payload.speed).toBe(150);
      expect(result.payload.threshold).toBe(120);
    });

    it('自定义阈值生效', () => {
      const result = checkSpeed('v-1', 100, { speedThresholdKmh: 80 });
      expect(result).not.toBeNull();
      expect(result.payload.threshold).toBe(80);
    });
  });

  describe('checkBatteryDrop', () => {
    it('无上一状态返回 null', () => {
      const result = checkBatteryDrop('v-1', 50, null, Date.now());
      expect(result).toBeNull();
    });

    it('时间窗内小幅度下降返回 null', () => {
      const now = Date.now();
      const result = checkBatteryDrop('v-1', 90, { battery: 95, ts: now - 10_000 }, now);
      expect(result).toBeNull();
    });

    it('时间窗内骤降产生告警', () => {
      const now = Date.now();
      const result = checkBatteryDrop('v-1', 60, { battery: 90, ts: now - 10_000 }, now);
      expect(result).not.toBeNull();
      expect(result.alertType).toBe('battery_drop');
      expect(result.level).toBe('critical');
      expect(result.payload.previousBattery).toBe(90);
      expect(result.payload.currentBattery).toBe(60);
      expect(result.payload.drop).toBe(30);
    });

    it('超出时间窗不产生告警', () => {
      const now = Date.now();
      const result = checkBatteryDrop('v-1', 60, { battery: 90, ts: now - 60_000 }, now);
      expect(result).toBeNull();
    });
  });

  describe('detectAnomalies', () => {
    it('正常状态无告警', () => {
      const result = detectAnomalies({
        vehicleId: 'v-1',
        current: { ts: Date.now(), speed: 60, battery: 90 },
        previous: null,
        config: DEFAULT_CONFIG,
      });
      expect(result).toEqual([]);
    });

    it('同时速度异常和电量骤降，返回两条告警', () => {
      const now = Date.now();
      const result = detectAnomalies({
        vehicleId: 'v-1',
        current: { ts: now, speed: 150, battery: 60 },
        previous: { battery: 90, ts: now - 10_000 },
        config: DEFAULT_CONFIG,
      });
      expect(result).toHaveLength(2);
      expect(result.map((a: { alertType: string }) => a.alertType).sort()).toEqual([
        'battery_drop',
        'speed_anomaly',
      ]);
    });
  });

  describe('默认值', () => {
    it('DEFAULT_CONFIG 包含 3 个字段', () => {
      expect(Object.keys(DEFAULT_CONFIG).sort()).toEqual([
        'batteryDropPercent',
        'batteryDropWindowMs',
        'speedThresholdKmh',
      ]);
    });
  });
});
