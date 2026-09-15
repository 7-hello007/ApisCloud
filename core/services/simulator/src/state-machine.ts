import type { VehicleStatus } from './types';

/** 电量低阈值：低于此值开始充电 */
export const BATTERY_LOW = 20;

/** 电量危险阈值：低于此值强制充电 */
export const BATTERY_CRITICAL = 5;

/** 电量充满阈值：达到此值停止充电 */
export const BATTERY_FULL = 95;

/** 行驶时每秒耗电（%） */
const DRAIN_PER_SEC = 0.1;

/** 充电时每秒充入（%） */
const CHARGE_PER_SEC = 2;

export interface StateInput {
  /** 当前状态 */
  status: VehicleStatus;
  /** 当前电量 */
  battery: number;
  /** 是否有目标点 */
  hasTarget: boolean;
  /** 是否到达目标点 */
  reachedTarget: boolean;
}

/**
 * 根据输入计算下一个状态。
 * 状态迁移规则：
 *   idle      → 电量低则 charging；有目标则 running
 *   running   → 电量危险则 charging；到达则 idle
 *   charging  → 电量满则 idle
 *   maintenance / offline → 保持
 */
export function nextState(input: StateInput): VehicleStatus {
  const { status, battery, hasTarget, reachedTarget } = input;

  switch (status) {
    case 'idle':
      if (battery <= BATTERY_LOW) return 'charging';
      if (hasTarget) return 'running';
      return 'idle';

    case 'running':
      if (battery <= BATTERY_CRITICAL) return 'charging';
      if (reachedTarget) return 'idle';
      return 'running';

    case 'charging':
      if (battery >= BATTERY_FULL) return 'idle';
      return 'charging';

    case 'maintenance':
    case 'offline':
      return status;
  }
}

/**
 * 根据状态计算下一个电量。
 * 行驶耗电，充电充入，其他状态不变。
 */
export function nextBattery(current: number, status: VehicleStatus, tickSec: number): number {
  let next = current;
  if (status === 'running') {
    next -= DRAIN_PER_SEC * tickSec;
  } else if (status === 'charging') {
    next += CHARGE_PER_SEC * tickSec;
  }
  return Math.max(0, Math.min(100, next));
}
