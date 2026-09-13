import path from 'node:path';

import type { DispatchTask, DispatchVehicle } from '@apiscloud/dispatch-core';
import { loadAlgorithmsFromDir } from '@apiscloud/dispatch-core';

const PLUGINS_DIR = path.resolve(__dirname, '..', 'plugins', 'dispatch');

function makeTask(priority: number): DispatchTask {
  return {
    task_id: 'task-1',
    task_type: 'rescue',
    origin: { lat: 31.2304, lng: 121.4737 },
    priority,
  };
}

function makeVehicle(
  vehicle_id: string,
  lat: number,
  lng: number,
  battery: number,
): DispatchVehicle {
  return {
    vehicle_id,
    position: { lat, lng },
    status: 'idle',
    battery,
  };
}

describe('dispatch.priority', () => {
  it('从插件目录加载 priority-dispatch 算法', () => {
    const algorithms = loadAlgorithmsFromDir(PLUGINS_DIR);
    const pd = algorithms.find((a) => a.name === 'priority-dispatch');
    expect(pd).toBeDefined();
  });

  it('高优先级任务偏好最近的车', async () => {
    const algorithms = loadAlgorithmsFromDir(PLUGINS_DIR);
    const pd = algorithms.find((a) => a.name === 'priority-dispatch')!;

    const task = makeTask(100);
    const candidates = [
      makeVehicle('v-near-lowbat', 31.231, 121.474, 30),
      makeVehicle('v-far-highbat', 31.5, 121.8, 100),
    ];

    const result = await pd.rank({ task, candidates });
    expect(result.ranked[0].vehicle_id).toBe('v-near-lowbat');
  });

  it('低优先级任务偏好电量高的车', async () => {
    const algorithms = loadAlgorithmsFromDir(PLUGINS_DIR);
    const pd = algorithms.find((a) => a.name === 'priority-dispatch')!;

    const task = makeTask(0);
    const candidates = [
      makeVehicle('v-near-lowbat', 31.231, 121.474, 30),
      makeVehicle('v-far-highbat', 31.5, 121.8, 100),
    ];

    const result = await pd.rank({ task, candidates });
    expect(result.ranked[0].vehicle_id).toBe('v-far-highbat');
  });
});
