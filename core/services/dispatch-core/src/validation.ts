import { z } from 'zod';
import { Battery, Latitude, Longitude, Priority, TaskId, VehicleId } from '@apiscloud/libs';

import type { DispatchTask, DispatchVehicle } from './types';

/**
 * 地理坐标。
 */
export const GeoPointSchema = z.object({
  lat: Latitude,
  lng: Longitude,
});

/**
 * 时间窗。
 */
export const TimeWindowSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

/**
 * 任务类型。
 */
export const TaskTypeSchema = z.enum([
  'passenger',
  'inspection',
  'logistics',
  'charging',
  'maintenance',
  'rescue',
]);

/**
 * 调度任务 schema。
 */
export const DispatchTaskSchema = z.object({
  task_id: TaskId,
  task_type: TaskTypeSchema,
  origin: GeoPointSchema,
  destination: GeoPointSchema.optional(),
  time_window: TimeWindowSchema.optional(),
  priority: Priority,
  constraints: z.record(z.string(), z.unknown()).optional(),
  service_level: z.string().max(64).optional(),
});

/**
 * 车辆状态。
 */
export const VehicleStatusSchema = z.enum([
  'idle',
  'running',
  'charging',
  'maintenance',
  'offline',
]);

/**
 * 候选车辆 schema。
 */
export const DispatchVehicleSchema = z.object({
  vehicle_id: VehicleId,
  position: GeoPointSchema,
  status: VehicleStatusSchema,
  battery: Battery,
  capabilities: z.array(z.string()).optional(),
  constraints: z.record(z.string(), z.unknown()).optional(),
});

/**
 * 从 unknown 解析任务，失败抛错。
 */
export function parseTask(input: unknown): DispatchTask {
  const result = DispatchTaskSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`任务校验失败：${issues}`);
  }
  return result.data as DispatchTask;
}

/**
 * 从 unknown 解析车辆，失败抛错。
 */
export function parseVehicle(input: unknown): DispatchVehicle {
  const result = DispatchVehicleSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`车辆校验失败：${issues}`);
  }
  return result.data as DispatchVehicle;
}