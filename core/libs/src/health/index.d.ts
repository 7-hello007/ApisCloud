import type { HealthCheckFn, HealthCheckResult, HealthReport, HealthState } from './types';
/**
 * 健康检查注册中心。
 * 各服务注册自己的检查项，统一暴露 /health。
 */
export declare class HealthRegistry {
    private readonly service;
    private readonly startedAt;
    private readonly checks;
    constructor(service: string);
    register(name: string, fn: HealthCheckFn): void;
    check(): Promise<HealthReport>;
    /**
     * 返回 Express/Koa 可用的 handler
     */
    handler(): (req: unknown, res: {
        status: (n: number) => {
            json: (b: unknown) => void;
        };
    }) => Promise<void>;
}
export declare function createHealthRegistry(service: string): HealthRegistry;
export type { HealthCheckFn, HealthCheckResult, HealthReport, HealthState };
//# sourceMappingURL=index.d.ts.map