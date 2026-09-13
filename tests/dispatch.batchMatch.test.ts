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

function makeVehicle(
  vehicle_id: string,
  lat: number,
  lng: number,
  battery: number,
  capabilities?: string[],
): DispatchVehicle {
  return {
    vehicle_id,
    position: { lat, lng },
    status: 'idle',
    battery,
    capabilities,
  };
}

describe('dispatch.batchMatch', () => {
  it('从插件目录加载 batch-match 算法', () => {
    const algorithms = loadAlgorithmsFromDir(PLUGINS_DIR);
    const bm = algorithms.find((a) => a.name === 'batch-match');
    expect(bm).toBeDefined();
  });

  it('电量高且距离近的车排前', async () => {
    const algorithms = loadAlgorithmsFromDir(PLUGINS_DIR);
    const bm = algorithms.find((a) => a.name === 'batch-match')!;

    const task = makeTask();
    const candidates = [
      makeVehicle('v-a', 31.3, 121.5, 50),
      makeVehicle('v-b', 31.232, 121.474, 95),
      makeVehicle('v-c', 31.5, 121.8, 95),
    ];

    const result = await bm.rank({ task, candidates });
    expect(result.ranked[0].vehicle_id).toBe('v-b');
  });

  it('能力匹配加成生效', async () => {
    const algorithms = loadAlgorithmsFromDir(PLUGINS_DIR);
    const bm = algorithms.find((a) => a.name === 'batch-match')!;

    const task = makeTask({ task_type: 'passenger' });
    const candidates = [
      makeVehicle('v-no-cap', 31.231, 121.474, 80, ['logistics']),
      makeVehicle('v-has-cap', 31.232, 121.475, 80, ['passenger', 'logistics']),
    ];

    const result = await bm.rank({ task, candidates });
    expect(result.ranked[0].vehicle_id).toBe('v-has-cap');
  });
});
