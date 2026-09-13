/* eslint-disable @typescript-eslint/no-require-imports */
const {
  DEFAULT_LOW_SPEED_THRESHOLD,
  DEFAULT_SUGGESTED_SPEED,
  DEFAULT_COOLDOWN_MS,
  shouldOptimize,
  selectOptimizeCandidates,
  buildOptimizeCommand,
  pruneRecentCommands,
} = require('../plugins/route-optimizer/src/optimizer.js');

describe('routeOptimizer.optimizer', () => {
  describe('shouldOptimize', () => {
    it('running 且低速返回 true', () => {
      expect(shouldOptimize({ status: 'running', speed: 10 })).toBe(true);
    });

    it('running 但速度正常返回 false', () => {
      expect(shouldOptimize({ status: 'running', speed: 40 })).toBe(false);
    });

    it('非 running 状态返回 false', () => {
      expect(shouldOptimize({ status: 'idle', speed: 0 })).toBe(false);
    });

    it('自定义阈值生效', () => {
      expect(shouldOptimize({ status: 'running', speed: 20 }, { lowSpeedThreshold: 25 })).toBe(
        true,
      );
    });
  });

  describe('selectOptimizeCandidates', () => {
    it('无冷却记录时全部通过', () => {
      const result = selectOptimizeCandidates({
        candidates: ['v-1', 'v-2'],
        recentCommands: new Map(),
        now: 1000,
      });
      expect(result).toEqual(['v-1', 'v-2']);
    });

    it('冷却期内被过滤', () => {
      const recent = new Map<string, number>([['v-1', 900]]);
      const result = selectOptimizeCandidates({
        candidates: ['v-1', 'v-2'],
        recentCommands: recent,
        now: 1000,
        cooldownMs: 500,
      });
      // v-1: 1000-900=100 < 500，过滤
      expect(result).toEqual(['v-2']);
    });
  });

  describe('buildOptimizeCommand', () => {
    it('结构与 DownlinkCommand 一致', () => {
      const cmd = buildOptimizeCommand('v-000001', {
        currentSpeed: 10,
        suggestedSpeed: 40,
        now: 1234567890,
      });
      expect(cmd.vehicle_id).toBe('v-000001');
      expect(cmd.command_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(cmd.command_type).toBe('dispatch');
      expect(cmd.payload.reason).toBe('route_optimize');
      expect(cmd.payload.optimization).toBe('speed_boost');
      expect(cmd.payload.current_speed).toBe(10);
      expect(cmd.payload.suggested_speed).toBe(40);
      expect(cmd.payload.issued_at).toBe(1234567890);
    });
  });

  describe('pruneRecentCommands', () => {
    it('清理过期记录', () => {
      const recent = new Map<string, number>([
        ['v-1', 100],
        ['v-2', 500],
      ]);
      pruneRecentCommands(recent, 1000, 600);
      expect(recent.has('v-1')).toBe(false);
      expect(recent.has('v-2')).toBe(true);
    });
  });

  describe('默认值', () => {
    it('LOW_SPEED_THRESHOLD 是 15', () => {
      expect(DEFAULT_LOW_SPEED_THRESHOLD).toBe(15);
    });
    it('SUGGESTED_SPEED 是 40', () => {
      expect(DEFAULT_SUGGESTED_SPEED).toBe(40);
    });
    it('COOLDOWN_MS 是 3 分钟', () => {
      expect(DEFAULT_COOLDOWN_MS).toBe(3 * 60 * 1000);
    });
  });
});
