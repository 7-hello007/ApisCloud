import {
  BATTERY_CRITICAL,
  BATTERY_FULL,
  BATTERY_LOW,
  nextBattery,
  nextState,
} from '@apiscloud/simulator';

describe('simulator.stateMachine', () => {
  describe('nextState', () => {
    it('idle + 电量充足 + 无目标 → idle', () => {
      expect(
        nextState({
          status: 'idle',
          battery: 80,
          hasTarget: false,
          reachedTarget: false,
        }),
      ).toBe('idle');
    });

    it('idle + 电量充足 + 有目标 → running', () => {
      expect(
        nextState({
          status: 'idle',
          battery: 80,
          hasTarget: true,
          reachedTarget: false,
        }),
      ).toBe('running');
    });

    it('idle + 电量低 → charging', () => {
      expect(
        nextState({
          status: 'idle',
          battery: BATTERY_LOW - 1,
          hasTarget: false,
          reachedTarget: false,
        }),
      ).toBe('charging');
    });

    it('idle + 电量低优先于有目标 → charging', () => {
      expect(
        nextState({
          status: 'idle',
          battery: BATTERY_LOW - 1,
          hasTarget: true,
          reachedTarget: false,
        }),
      ).toBe('charging');
    });

    it('running + 到达目标 → idle', () => {
      expect(
        nextState({
          status: 'running',
          battery: 80,
          hasTarget: true,
          reachedTarget: true,
        }),
      ).toBe('idle');
    });

    it('running + 未到达 + 电量充足 → running', () => {
      expect(
        nextState({
          status: 'running',
          battery: 80,
          hasTarget: true,
          reachedTarget: false,
        }),
      ).toBe('running');
    });

    it('running + 电量危险 → charging', () => {
      expect(
        nextState({
          status: 'running',
          battery: BATTERY_CRITICAL - 1,
          hasTarget: true,
          reachedTarget: false,
        }),
      ).toBe('charging');
    });

    it('running + 电量危险优先于到达 → charging', () => {
      expect(
        nextState({
          status: 'running',
          battery: BATTERY_CRITICAL - 1,
          hasTarget: true,
          reachedTarget: true,
        }),
      ).toBe('charging');
    });

    it('charging + 未充满 → charging', () => {
      expect(
        nextState({
          status: 'charging',
          battery: 50,
          hasTarget: false,
          reachedTarget: false,
        }),
      ).toBe('charging');
    });

    it('charging + 充满 → idle', () => {
      expect(
        nextState({
          status: 'charging',
          battery: BATTERY_FULL,
          hasTarget: false,
          reachedTarget: false,
        }),
      ).toBe('idle');
    });

    it('maintenance → maintenance', () => {
      expect(
        nextState({
          status: 'maintenance',
          battery: 80,
          hasTarget: false,
          reachedTarget: false,
        }),
      ).toBe('maintenance');
    });

    it('offline → offline', () => {
      expect(
        nextState({
          status: 'offline',
          battery: 80,
          hasTarget: false,
          reachedTarget: false,
        }),
      ).toBe('offline');
    });
  });

  describe('nextBattery', () => {
    it('running 耗电', () => {
      const next = nextBattery(80, 'running', 1);
      expect(next).toBeLessThan(80);
      expect(next).toBeGreaterThan(79);
    });

    it('charging 充电', () => {
      const next = nextBattery(50, 'charging', 1);
      expect(next).toBeGreaterThan(50);
    });

    it('idle 不变', () => {
      expect(nextBattery(50, 'idle', 1)).toBe(50);
    });

    it('maintenance 不变', () => {
      expect(nextBattery(50, 'maintenance', 1)).toBe(50);
    });

    it('offline 不变', () => {
      expect(nextBattery(50, 'offline', 1)).toBe(50);
    });

    it('不会低于 0', () => {
      expect(nextBattery(0.01, 'running', 100)).toBe(0);
    });

    it('不会超过 100', () => {
      expect(nextBattery(99, 'charging', 100)).toBe(100);
    });

    it('tickSec 影响耗电量', () => {
      const drain1 = 80 - nextBattery(80, 'running', 1);
      const drain5 = 80 - nextBattery(80, 'running', 5);
      expect(drain5).toBeCloseTo(drain1 * 5, 5);
    });
  });
});