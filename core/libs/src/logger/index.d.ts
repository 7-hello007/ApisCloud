import { type Logger as PinoLogger } from 'pino';
import type { LogContext, LoggerOptions } from './types';
export type Logger = PinoLogger;
/**
 * 创建带统一字段的 pino logger。
 * 所有日志自动带 service、layer、trace_id、span_id。
 */
export declare function createLogger(options: LoggerOptions): Logger;
/**
 * 给 logger 绑定上下文（trace_id、span_id 等）。
 * 返回一个带 child 上下文的 logger。
 */
export declare function withContext(logger: Logger, ctx: LogContext): Logger;
export type { LogContext, LoggerOptions };
//# sourceMappingURL=index.d.ts.map