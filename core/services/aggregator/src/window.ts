import type { TelemetryRawPayload } from './types';

/**
 * 时间窗缓存。
 * 用 Map<vehicle_id, TelemetryRawPayload> 累积最新状态。
 * 每 windowMs 触发聚合，清空并重新累积。
 */
export class AggregationWindow {
  private readonly buffer = new Map<string, TelemetryRawPayload>();

  /**
   * 写入或更新一条遥测。
   * 同一车辆只保留最新一条。
   */
  push(payload: TelemetryRawPayload): void {
    this.buffer.set(payload.vehicle_id, payload);
  }

  /**
   * 返回当前窗口内的所有快照，并清空缓冲。
   */
  drain(): TelemetryRawPayload[] {
    const all = Array.from(this.buffer.values());
    this.buffer.clear();
    return all;
  }

  /** 当前缓存条数 */
  size(): number {
    return this.buffer.size;
  }

  /** 清空缓冲，不返回数据 */
  clear(): void {
    this.buffer.clear();
  }
}
