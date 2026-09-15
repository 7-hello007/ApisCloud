'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.HealthRegistry = void 0;
exports.createHealthRegistry = createHealthRegistry;
/**
 * 健康检查注册中心。
 * 各服务注册自己的检查项，统一暴露 /health。
 */
class HealthRegistry {
  service;
  startedAt;
  checks = new Map();
  constructor(service) {
    this.service = service;
    this.startedAt = Date.now();
  }
  register(name, fn) {
    this.checks.set(name, fn);
  }
  async check() {
    const entries = Array.from(this.checks.entries());
    const results = await Promise.all(
      entries.map(async ([name, fn]) => {
        const start = Date.now();
        try {
          const r = await fn();
          return [name, { ...r, latencyMs: Date.now() - start }];
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return [name, { status: 'down', message, latencyMs: Date.now() - start }];
        }
      }),
    );
    const checks = {};
    let overall = 'ok';
    for (const [name, result] of results) {
      checks[name] = result;
      if (result.status === 'down') {
        overall = 'down';
      } else if (result.status === 'degraded' && overall === 'ok') {
        overall = 'degraded';
      }
    }
    return {
      status: overall,
      service: this.service,
      timestamp: new Date().toISOString(),
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      checks,
    };
  }
  /**
   * 返回 Express/Koa 可用的 handler
   */
  handler() {
    return async (_req, res) => {
      const report = await this.check();
      const httpStatus = report.status === 'down' ? 503 : 200;
      res.status(httpStatus).json(report);
    };
  }
}
exports.HealthRegistry = HealthRegistry;
function createHealthRegistry(service) {
  return new HealthRegistry(service);
}
//# sourceMappingURL=index.js.map
