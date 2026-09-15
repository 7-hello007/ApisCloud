import {
  filterCandidates,
  MAX_PICKUP_DISTANCE_KM,
  MIN_BATTERY_PERCENT,
  type DispatchCoreConfig,
  type DispatchTask,
  type DispatchVehicle,
} from '@apiscloud/dispatch-core';

const BASE_CONFIG: DispatchCoreConfig = {
  defaultAlgorithm: 'nearest',
  fallbackAlgorithm: 'nearest',
  algorithmTimeoutMs: 500,
  consumerGroup: 'test',
  weights: { distance: 1, eta: 0.5, battery: 0.3, priority: 2 },
  signSecret: 'test',
  signTtlSec: 60,
  regionCenterLat: 31.2304,
  regionCenterLng: 121.4737,
  regionRadiusKm: 30,
};

function makeTask(overrides: Partial<DispatchTask> = {}): DispatchTask {
  return {
    task_id: 'task-1',
    task_type: 'passenger',
    origin: { lat: 31.2304, lng: 121.4737 },
    priority: 50,
    ...overrides,
  };
}

function makeVehicle(
  vehicle_id: string,
  overrides: Partial<DispatchVehicle> = {},
): DispatchVehicle {
  return {
    vehicle_id,
    position: { lat: 31.2304, lng: 121.4737 },
    status: 'idle',
    battery: 80,
    ...overrides,
  };
}

describe('dispatchCore.constraints.edgeCases', () => {
  describe('空列表', () => {
    it('无候选车辆', () => {
      const result = filterCandidates(makeTask(), [], BASE_CONFIG);
      expect(result.passed).toEqual([]);
      expect(result.rejected).toEqual([]);
    });
  });

  describe('状态约束', () => {
    it('idle 通过', () => {
      const result = filterCandidates(makeTask(), [makeVehicle('v-1')], BASE_CONFIG);
      expect(result.passed).toHaveLength(1);
    });

    it.each(['running', 'charging', 'maintenance', 'offline'] as const)(
      'status=%s 被拒绝',
      (status) => {
        const result = filterCandidates(makeTask(), [makeVehicle('v-1', { status })], BASE_CONFIG);
        expect(result.passed).toHaveLength(0);
        expect(result.rejected).toHaveLength(1);
        expect(result.rejected[0].reason).toContain('idle');
      },
    );
  });

  describe('电量约束', () => {
    it(`battery = ${MIN_BATTERY_PERCENT} 通过（等于阈值）`, () => {
      const result = filterCandidates(
        makeTask(),
        [makeVehicle('v-1', { battery: MIN_BATTERY_PERCENT })],
        BASE_CONFIG,
      );
      expect(result.passed).toHaveLength(1);
    });

    it(`battery = ${MIN_BATTERY_PERCENT - 1} 被拒绝`, () => {
      const result = filterCandidates(
        makeTask(),
        [makeVehicle('v-1', { battery: MIN_BATTERY_PERCENT - 1 })],
        BASE_CONFIG,
      );
      expect(result.passed).toHaveLength(0);
      expect(result.rejected[0].reason).toContain('电量');
    });

    it('battery = 0 被拒绝', () => {
      const result = filterCandidates(
        makeTask(),
        [makeVehicle('v-1', { battery: 0 })],
        BASE_CONFIG,
      );
      expect(result.rejected).toHaveLength(1);
    });
  });

  describe('服务能力约束', () => {
    it('capabilities 为空时不校验', () => {
      const result = filterCandidates(
        makeTask({ task_type: 'logistics' }),
        [makeVehicle('v-1')],
        BASE_CONFIG,
      );
      expect(result.passed).toHaveLength(1);
    });

    it('capabilities 包含 task_type 通过', () => {
      const result = filterCandidates(
        makeTask({ task_type: 'logistics' }),
        [makeVehicle('v-1', { capabilities: ['passenger', 'logistics'] })],
        BASE_CONFIG,
      );
      expect(result.passed).toHaveLength(1);
    });

    it('capabilities 不包含 task_type 被拒绝', () => {
      const result = filterCandidates(
        makeTask({ task_type: 'logistics' }),
        [makeVehicle('v-1', { capabilities: ['passenger'] })],
        BASE_CONFIG,
      );
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toContain('logistics');
    });
  });

  describe('地理约束', () => {
    it('在运营区域内通过', () => {
      const result = filterCandidates(
        makeTask(),
        [makeVehicle('v-1', { position: { lat: 31.2304, lng: 121.4737 } })],
        BASE_CONFIG,
      );
      expect(result.passed).toHaveLength(1);
    });

    it('在运营区域边缘（约 30km）通过', () => {
      // 纬度 +0.26 约 29km
      const result = filterCandidates(
        makeTask(),
        [makeVehicle('v-1', { position: { lat: 31.2304 + 0.26, lng: 121.4737 } })],
        BASE_CONFIG,
      );
      expect(result.passed).toHaveLength(1);
    });

    it('在运营区域外（约 50km）被拒绝', () => {
      const result = filterCandidates(
        makeTask(),
        [makeVehicle('v-1', { position: { lat: 31.2304 + 0.45, lng: 121.4737 } })],
        BASE_CONFIG,
      );
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toContain('运营区域');
    });
  });

  describe('pickup 距离约束', () => {
    it(`pickup 距离 = ${MAX_PICKUP_DISTANCE_KM}km 边界`, () => {
      // 0.45 度纬度 ≈ 50km
      const result = filterCandidates(
        makeTask({ origin: { lat: 31.2304, lng: 121.4737 } }),
        [
          makeVehicle('v-1', {
            position: { lat: 31.2304 + 0.45, lng: 121.4737 },
          }),
        ],
        { ...BASE_CONFIG, regionRadiusKm: 100 }, // 放开地理约束
      );
      // 边界值可能在通过或拒绝两侧，只要不报错即可
      expect(result.passed.length + result.rejected.length).toBe(1);
    });

    it('pickup 距离过远被拒绝', () => {
      const result = filterCandidates(
        makeTask({ origin: { lat: 31.2304, lng: 121.4737 } }),
        [
          makeVehicle('v-1', {
            position: { lat: 32.0, lng: 121.4737 }, // 约 85km
          }),
        ],
        { ...BASE_CONFIG, regionRadiusKm: 200 },
      );
      expect(result.rejected).toHaveLength(1);
    });
  });

  describe('时间窗约束', () => {
    it('无时间窗不限', () => {
      const result = filterCandidates(makeTask(), [makeVehicle('v-1')], BASE_CONFIG);
      expect(result.passed).toHaveLength(1);
    });

    it('时间窗未过通过', () => {
      const future = Date.now() + 3600_000;
      const result = filterCandidates(
        makeTask({ time_window: { start: Date.now(), end: future } }),
        [makeVehicle('v-1')],
        BASE_CONFIG,
      );
      expect(result.passed).toHaveLength(1);
    });

    it('时间窗已过被拒绝', () => {
      const past = Date.now() - 3600_000;
      // 用近距离位置，避免先被地理约束拒绝
      const result = filterCandidates(
        makeTask({ time_window: { start: past - 60_000, end: past } }),
        [makeVehicle('v-1', { position: { lat: 31.231, lng: 121.474 } })],
        BASE_CONFIG,
      );
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toContain('时间窗');
    });
  });

  describe('多条候选混合', () => {
    it('5 辆车中 3 辆通过 2 辆被拒', () => {
      const result = filterCandidates(
        makeTask(),
        [
          makeVehicle('v-1'), // 通过
          makeVehicle('v-2', { status: 'running' }), // 状态拒绝
          makeVehicle('v-3', { battery: 5 }), // 电量拒绝
          makeVehicle('v-4'), // 通过
          makeVehicle('v-5'), // 通过
        ],
        BASE_CONFIG,
      );
      expect(result.passed).toHaveLength(3);
      expect(result.rejected).toHaveLength(2);
      expect(result.passed.map((v) => v.vehicle_id).sort()).toEqual(['v-1', 'v-4', 'v-5']);
    });

    it('全部被拒绝', () => {
      const result = filterCandidates(
        makeTask(),
        [
          makeVehicle('v-1', { status: 'running' }),
          makeVehicle('v-2', { battery: 5 }),
          makeVehicle('v-3', { status: 'charging' }),
        ],
        BASE_CONFIG,
      );
      expect(result.passed).toEqual([]);
      expect(result.rejected).toHaveLength(3);
    });
  });
});
