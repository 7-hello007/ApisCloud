import { Registry, Counter, Gauge, Histogram } from 'prom-client';
export interface MetricsRegistry {
    registry: Registry;
    counter(name: string, help: string, labelNames?: string[]): Counter<string>;
    gauge(name: string, help: string, labelNames?: string[]): Gauge<string>;
    histogram(name: string, help: string, labelNames?: string[], buckets?: number[]): Histogram<string>;
    metrics(): Promise<string>;
    contentType(): string;
}
export declare function createMetrics(serviceName: string): MetricsRegistry;
//# sourceMappingURL=index.d.ts.map