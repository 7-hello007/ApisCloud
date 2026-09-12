export type HealthState = 'ok' | 'degraded' | 'down';
export interface HealthCheckResult {
    status: HealthState;
    message?: string;
    latencyMs?: number;
}
export interface HealthReport {
    status: HealthState;
    service: string;
    timestamp: string;
    uptimeSec: number;
    checks: Record<string, HealthCheckResult>;
}
export type HealthCheckFn = () => Promise<HealthCheckResult>;
//# sourceMappingURL=types.d.ts.map