import pino, { type Logger as PinoLogger } from 'pino';

import type { LogContext, LoggerOptions } from './types';

export type Logger = PinoLogger;

/**
 * 创建带统一字段的 pino logger。
 * 所有日志自动带 service、layer、trace_id、span_id。
 */
export function createLogger(options: LoggerOptions): Logger {
  const { service, level = 'info', layer = 'single', pretty = false } = options;

  return pino({
    name: service,
    level,
    base: {
      service,
      layer,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  });
}

/**
 * 给 logger 绑定上下文（trace_id、span_id 等）。
 * 返回一个带 child 上下文的 logger。
 */
export function withContext(logger: Logger, ctx: LogContext): Logger {
  return logger.child(ctx);
}

export type { LogContext, LoggerOptions };
