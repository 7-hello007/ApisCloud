/* eslint-disable @typescript-eslint/no-require-imports */
const {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_LOW_BATTERY_THRESHOLD,
  selectChargingCandidates,
  buildChargeCommand,
  pruneRecentCommands,
} = require('../plugins/charging-scheduler/src/detectors.js');

describe('chargingScheduler.detectors', () => {
  describe('selectChargingCandidates', () => {
    it('无冷却记录时全部通过', () => {
      const result = selectChargingCandidates({
        lowBatteryVehicles: ['v-1', 'v-2', 'v-3'],
        recentCommands: new Map(),
        now: 1000,
      });
      expect(result).toEqual(['v-1', 'v-2', 'v-3']);
    });

    it('冷却期内的车辆被过滤', () => {
      const recent = new Map<string, number>([
        ['v-1', 500],
        ['v-2', 100],
      ]);
      const result = selectChargingCandidates({
        lowBatteryVehicles: ['v-1', 'v-2', 'v-3'],
        recentCommands: recent,
        now: 1000,
        cooldownMs: 1000,
      });
      // v-1: 1000-500=500 < 1000，过滤
      // v-2: 1000-100=900 < 1000，过滤
      // v-3: 无记录，通过
      expect(result).toEqual(['v-3']);
    });

    it('超过冷却期的车辆重新通过', () => {
      const recent = new Map<string, number>([['v-1', 500]]);
      const result = selectChargingCandidates({
        lowBatteryVehicles: ['v-1'],
        recentCommands: recent,
        now: 2000,
        cooldownMs: 1000,
      });
      // 2000-500=1500 > 1000，通过
      expect(result).toEqual(['v-1']);
    });

    it('空列表返回空', () => {
      const result = selectChargingCandidates({
        lowBatteryVehicles: [],
        recentCommands: new Map(),
        now: 1000,
      });
      expect(result).toEqual([]);
    });

    it('默认冷却时间是 5 分钟', () => {
      expect(DEFAULT_COOLDOWN_MS).toBe(5 * 60 * 1000);
    });
  });

  describe('buildChargeCommand', () => {
    it('生成符合 DownlinkCommand 结构的指令', () => {
      const cmd = buildChargeCommand('v-000001', { threshold: 20, now: 1234567890 });
      expect(cmd.vehicle_id).toBe('v-000001');
      expect(cmd.command_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(cmd.command_type).toBe('charge');
      expect(cmd.payload.reason).toBe('low_battery');
      expect(cmd.payload.threshold).toBe(20);
      expect(cmd.payload.issued_at).toBe(1234567890);
    });

    it('每次生成唯一 command_id', () => {
      const a = buildChargeCommand('v-1', { threshold: 20, now: 1000 });
      const b = buildChargeCommand('v-1', { threshold: 20, now: 1000 });
      expect(a.command_id).not.toBe(b.command_id);
    });
  });

  describe('pruneRecentCommands', () => {
    it('清理过期记录', () => {
      const recent = new Map<string, number>([
        ['v-1', 100],
        ['v-2', 500],
        ['v-3', 900],
      ]);
      pruneRecentCommands(recent, 1000, 600);
      // 1000-100=900 > 600，删除
      // 1000-500=500 < 600，保留
      // 1000-900=100 < 600，保留
      expect(recent.has('v-1')).toBe(false);
      expect(recent.has('v-2')).toBe(true);
      expect(recent.has('v-3')).toBe(true);
    });

    it('空 Map 安全', () => {
      const recent = new Map<string, number>();
      expect(() => pruneRecentCommands(recent, 1000, 600)).not.toThrow();
    });
  });

  describe('默认值', () => {
    it('DEFAULT_LOW_BATTERY_THRESHOLD 是 20', () => {
      expect(DEFAULT_LOW_BATTERY_THRESHOLD).toBe(20);
    });
  });
});
