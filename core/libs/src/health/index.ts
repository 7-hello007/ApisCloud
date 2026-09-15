import type { HealthCheckFn, HealthCheckResult, HealthReport, HealthState } from './types';

/**
 * 健康检查注册中心。
 * 各服务注册自己的检查项，统一暴露 /health。
 */
export class HealthRegistry {
  private readonly service: string;
  private readonly startedAt: number;
  private readonly checks = new Map<string, HealthCheckFn>();

  constructor(service: string) {
    this.service = service;
    this.startedAt = Date.now();
  }

  register(name: string, fn: HealthCheckFn): void {
    this.checks.set(name, fn);
  }

  async check(): Promise<HealthReport> {
    const entries = Array.from(this.checks.entries());
    const results = await Promise.all(
      entries.map(async ([name, fn]) => {
        const start = Date.now();
        try {
          const r = await fn();
          return [name, { ...r, latencyMs: Date.now() - start }] as const;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return [
            name,
            { status: 'down' as HealthState, message, latencyMs: Date.now() - start },
          ] as const;
        }
      }),
    );

    const checks: Record<string, HealthCheckResult> = {};
    let overall: HealthState = 'ok';

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
  handler(): (
    req: unknown,
    res: { status: (n: number) => { json: (b: unknown) => void } },
  ) => Promise<void> {
    return async (_req, res) => {
      const report = await this.check();
      const httpStatus = report.status === 'down' ? 503 : 200;
      res.status(httpStatus).json(report);
    };
  }
}

export function createHealthRegistry(service: string): HealthRegistry {
  return new HealthRegistry(service);
}

export type { HealthCheckFn, HealthCheckResult, HealthReport, HealthState };
