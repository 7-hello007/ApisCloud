import type { SimulatorConfig, VehicleState } from './types';
import { Vehicle } from './vehicle';

/**
 * 车队。
 * 管理 N 辆车，批量 tick 返回状态快照列表。
 */
export class Fleet {
  private readonly vehicles: Vehicle[];

  constructor(config: SimulatorConfig) {
    this.vehicles = [];
    for (let i = 0; i < config.vehicleCount; i++) {
      const id = `v-${String(i + 1).padStart(6, '0')}`;
      this.vehicles.push(new Vehicle(id, config));
    }
  }

  /**
   * 推进所有车辆一个时间片，返回状态列表。
   */
  tick(tickSec: number): VehicleState[] {
    return this.vehicles.map((v) => v.tick(tickSec));
  }

  /**
   * 当前车辆数。
   */
  size(): number {
    return this.vehicles.length;
  }
}
