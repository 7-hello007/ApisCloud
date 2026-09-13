import path from 'node:path';

import type { DispatchTask, DispatchVehicle } from '@apiscloud/dispatch-core';
import { loadAlgorithmsFromDir } from '@apiscloud/dispatch-core';

const PLUGINS_DIR = path.resolve(__dirname, '..', 'plugins', 'dispatch');

function makeTask(overrides: Partial<DispatchTask> = {}): DispatchTask {
  return {
    task_id: 'task-1',
    task_type: 'passenger',
    origin: { lat: 31.2304, lng: 121.4737 },
    priority: 50,
    ...overrides,
  };
}

function makeVehicle(vehicle_id: string, lat: number, lng: number): DispatchVehicle {
  return {
    vehicle_id,
    position: { lat, lng },
    status: 'idle',
    battery: 80,
  };
}

describe('dispatch.nearest', () => {
  it('从插件目录加载 nearest 算法', () => {
    const algorithms = loadAlgorithmsFromDir(PLUGINS_DIR);
    const nearest = algorithms.find((a) => a.name === 'nearest');
    expect(nearest).toBeDefined();
    expect(nearest!.version).toBe('1.0.0');
  });

  it('距离最近的车得分最高', async () => {
    const algorithms = loadAlgorithmsFromDir(PLUGINS_DIR);
    const nearest = algorithms.find((a) => a.name === 'nearest')!;

    const task = makeTask();
    const candidates = [
      makeVehicle('v-far', 31.5, 121.8),
      makeVehicle('v-near', 31.231, 121.474),
      makeVehicle('v-mid', 31.3, 121.5),
    ];

    const result = await nearest.rank({ task, candidates });
    expect(result.ranked[0].vehicle_id).toBe('v-near');
    expect(result.ranked[1].vehicle_id).toBe('v-mid');
    expect(result.ranked[2].vehicle_id).toBe('v-far');
  });

  it('返回结果按得分降序', async () => {
    const algorithms = loadAlgorithmsFromDir(PLUGINS_DIR);
    const nearest = algorithms.find((a) => a.name === 'nearest')!;

    const task = makeTask();
    const candidates = [
      makeVehicle('v1', 31.5, 121.8),
      makeVehicle('v2', 31.231, 121.474),
      makeVehicle('v3', 31.3, 121.5),
    ];

    const result = await nearest.rank({ task, candidates });
    for (let i = 1; i < result.ranked.length; i++) {
      expect(result.ranked[i - 1].score).toBeGreaterThanOrEqual(result.ranked[i].score);
    }
  });

  it('无候选返回空列表', async () => {
    const algorithms = loadAlgorithmsFromDir(PLUGINS_DIR);
    const nearest = algorithms.find((a) => a.name === 'nearest')!;
    const result = await nearest.rank({ task: makeTask(), candidates: [] });
    expect(result.ranked).toEqual([]);
  });
});
