import { z } from 'zod';

import { VALIDATION_MAX_STRING_LENGTH } from './constants';

/**
 * 输入验证上下文。
 */
export interface ValidationContext {
  validate<T>(schema: z.ZodType<T>, data: unknown): T;
  tryValidate<T>(
    schema: z.ZodType<T>,
    data: unknown,
  ): { ok: true; value: T } | { ok: false; error: string };
}

export function createValidation(): ValidationContext {
  return {
    validate<T>(schema: z.ZodType<T>, data: unknown): T {
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        throw new Error(`输入校验失败：${issues}`);
      }
      return parsed.data;
    },

    tryValidate<T>(schema: z.ZodType<T>, data: unknown) {
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        return { ok: false, error: `输入校验失败：${issues}` };
      }
      return { ok: true, value: parsed.data };
    },
  };
}

// ============================================================
// 常用 schema
// ============================================================

/** 非空字符串，限制最大长度 */
export const SafeString = z.string().min(1).max(VALIDATION_MAX_STRING_LENGTH);

/** 插件名 / 服务名 */
export const SafeName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/, '只能是小写字母、数字、连字符，且以字母开头');

/** 车辆 ID */
export const VehicleId = z.string().min(1).max(128);

/** 任务 ID */
export const TaskId = z.string().min(1).max(128);

/** 经纬度 */
export const Latitude = z.number().min(-90).max(90);
export const Longitude = z.number().min(-180).max(180);

/** 位置 */
export const Position = z.object({
  lat: Latitude,
  lng: Longitude,
});

/** 电量（百分比） */
export const Battery = z.number().min(0).max(100);

/** 时间窗 */
export const TimeWindow = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

/** 优先级 */
export const Priority = z.number().int().min(0).max(100);

/** 消息信封 */
export const EnvelopeSchema = z.object({
  id: z.string().uuid(),
  topic: SafeString,
  source: SafeString,
  timestamp: z.number().int().positive(),
  trace_id: SafeString,
  span_id: SafeString,
  version: SafeString,
  payload: z.unknown(),
});
