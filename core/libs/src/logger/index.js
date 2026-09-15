'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.createLogger = createLogger;
exports.withContext = withContext;
const pino_1 = __importDefault(require('pino'));
/**
 * 创建带统一字段的 pino logger。
 * 所有日志自动带 service、layer、trace_id、span_id。
 */
function createLogger(options) {
  const { service, level = 'info', layer = 'single', pretty = false } = options;
  return (0, pino_1.default)({
    name: service,
    level,
    base: {
      service,
      layer,
    },
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
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
function withContext(logger, ctx) {
  return logger.child(ctx);
}
//# sourceMappingURL=index.js.map
