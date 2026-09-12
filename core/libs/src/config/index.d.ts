import { ConfigSchema, type AppConfig } from './schema';
/**
 * 加载配置：
 * 1. 从 .env 读环境变量
 * 2. 用 zod 校验
 * 3. 缺关键字段直接抛错，启动即失败
 */
export declare function loadConfig(overrides?: Partial<AppConfig>): AppConfig;
/**
 * 重置缓存（测试用）
 */
export declare function resetConfig(): void;
export { ConfigSchema };
export type { AppConfig };
//# sourceMappingURL=index.d.ts.map