import * as dotenv from 'dotenv';

import { ConfigSchema, type AppConfig } from './schema';

let cached: AppConfig | null = null;

/**
 * 加载配置：
 * 1. 从 .env 读环境变量
 * 2. 用 zod 校验
 * 3. 缺关键字段直接抛错，启动即失败
 */
export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  if (cached && !overrides) {
    return cached;
  }

  dotenv.config({ quiet: true });

  const raw = {
    ...process.env,
    ...overrides,
  };

  const parsed = ConfigSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`配置校验失败：\n${issues}`);
  }

  if (!overrides) {
    cached = parsed.data;
  }

  return parsed.data;
}

/**
 * 重置缓存（测试用）
 */
export function resetConfig(): void {
  cached = null;
}

export { ConfigSchema };
export type { AppConfig };
