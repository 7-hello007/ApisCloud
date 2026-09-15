import {
  scoreVehicles,
  type DispatchTask,
  type DispatchVehicle,
  type ObjectiveWeights,
} from '@apiscloud/dispatch-core';

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

const BASE_WEIGHTS: ObjectiveWeights = {
  distance: 1.0,
  eta: 0.5,
  battery: 0.3,
  priority: 2.0,
};

describe('dispatchCore.objective.edgeCases', () => {
  describe('空列表', () => {
    it('无候选返回空数组', () => {
      const result = scoreVehicles(makeTask(), [], BASE_WEIGHTS);
      expect(result).toEqual([]);
    });
  });

  describe('单候选', () => {
    it('返回 1 个结果', () => {
      const result = scoreVehicles(makeTask(), [makeVehicle('v-1')], BASE_WEIGHTS);
      expect(result).toHaveLength(1);
      expect(result[0].vehicle_id).toBe('v-1');
    });

    it('breakdown 包含 4 个分量', () => {
      const result = scoreVehicles(makeTask(), [makeVehicle('v-1')], BASE_WEIGHTS);
      expect(result[0].breakdown).toHaveProperty('distance');
      expect(result[0].breakdown).toHaveProperty('eta');
      expect(result[0].breakdown).toHaveProperty('battery');
      expect(result[0].breakdown).toHaveProperty('priority');
    });

    it('distance 和 eta 有值', () => {
      const result = scoreVehicles(
        makeTask(),
        [makeVehicle('v-1', { position: { lat: 31.5, lng: 121.5 } })],
        BASE_WEIGHTS,
      );
      expect(result[0].distanceKm).toBeGreaterThan(0);
      expect(result[0].etaSec).toBeGreaterThan(0);
    });
  });

  describe('权重全 0', () => {
    it('所有 score 都是 0', () => {
      const weights: ObjectiveWeights = {
        distance: 0,
        eta: 0,
        battery: 0,
        priority: 0,
      };
      const result = scoreVehicles(
        makeTask(),
        [makeVehicle('v-1'), makeVehicle('v-2'), makeVehicle('v-3')],
        weights,
      );
      for (const s of result) {
        expect(s.score).toBeCloseTo(0, 10);
      }
    });
  });

  describe('负分', () => {
    it('距离远产生负分', () => {
      const result = scoreVehicles(
        makeTask(),
        [makeVehicle('v-far', { position: { lat: 32.0, lng: 122.0 } })],
        BASE_WEIGHTS,
      );
      // distance 项 = -distance/50，距离越大越负
      expect(result[0].breakdown.distance).toBeLessThan(0);
    });

    it('电量低产生低电量分', () => {
      const result = scoreVehicles(
        makeTask(),
        [makeVehicle('v-lowbat', { battery: 10 })],
        BASE_WEIGHTS,
      );
      // battery 项 = battery/100 = 0.1
      expect(result[0].breakdown.battery).toBeCloseTo(0.1, 5);
    });
  });

  describe('排序稳定性', () => {
    it('距离越近得分越高', () => {
      const task = makeTask({ origin: { lat: 31.2304, lng: 121.4737 } });
      const result = scoreVehicles(
        task,
        [
          makeVehicle('v-far', { position: { lat: 31.5, lng: 121.5 } }),
          makeVehicle('v-near', { position: { lat: 31.231, lng: 121.474 } }),
          makeVehicle('v-mid', { position: { lat: 31.3, lng: 121.4 } }),
        ],
        BASE_WEIGHTS,
      );
      expect(result[0].vehicle_id).toBe('v-near');
      expect(result[1].vehicle_id).toBe('v-mid');
      expect(result[2].vehicle_id).toBe('v-far');
    });

    it('得分降序排列', () => {
      const task = makeTask();
      const result = scoreVehicles(
        task,
        [
          makeVehicle('v-1', { position: { lat: 31.5, lng: 121.5 } }),
          makeVehicle('v-2', { position: { lat: 31.231, lng: 121.474 } }),
          makeVehicle('v-3', { position: { lat: 31.3, lng: 121.4 } }),
          makeVehicle('v-4', { position: { lat: 31.4, lng: 121.5 } }),
        ],
        BASE_WEIGHTS,
      );
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
      }
    });
  });

  describe('优先级项', () => {
    // 注：objective.ts 是固定权重加权求和，
    // "优先级动态调整距离/电量权重"的逻辑在 priority-dispatch 插件里，不在 objective。
    // 这里只验证优先级项本身是加分项。
    it('优先级越高，priority 分量越大', () => {
      const vehicles = [makeVehicle('v-1')];
      const resultLow = scoreVehicles(makeTask({ priority: 10 }), vehicles, BASE_WEIGHTS);
      const resultHigh = scoreVehicles(makeTask({ priority: 90 }), vehicles, BASE_WEIGHTS);

      expect(resultHigh[0].breakdown.priority).toBeGreaterThan(resultLow[0].breakdown.priority);
      expect(resultHigh[0].score).toBeGreaterThan(resultLow[0].score);
    });
  });

  describe('大量候选', () => {
    it('1000 辆车排序不抛错', () => {
      const vehicles: DispatchVehicle[] = [];
      for (let i = 0; i < 1000; i++) {
        vehicles.push(
          makeVehicle(`v-${i}`, {
            position: { lat: 31.0 + i * 0.001, lng: 121.0 + i * 0.001 },
            battery: 50 + (i % 50),
          }),
        );
      }
      const result = scoreVehicles(makeTask(), vehicles, BASE_WEIGHTS);
      expect(result).toHaveLength(1000);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
      }
    });
  });

  describe('分数组成', () => {
    it('总分数 = 各分量加权和', () => {
      const weights: ObjectiveWeights = {
        distance: 1,
        eta: 1,
        battery: 1,
        priority: 1,
      };
      const result = scoreVehicles(
        makeTask({ priority: 80 }),
        [makeVehicle('v-1', { battery: 60 })],
        weights,
      );
      const s = result[0];
      const expected =
        s.breakdown.distance + s.breakdown.eta + s.breakdown.battery + s.breakdown.priority;
      expect(s.score).toBeCloseTo(expected, 5);
    });
  });
});
