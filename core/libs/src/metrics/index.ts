import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

export interface MetricsRegistry {
  registry: Registry;
  counter(name: string, help: string, labelNames?: string[]): Counter<string>;
  gauge(name: string, help: string, labelNames?: string[]): Gauge<string>;
  histogram(
    name: string,
    help: string,
    labelNames?: string[],
    buckets?: number[],
  ): Histogram<string>;
  metrics(): Promise<string>;
  contentType(): string;
}

export function createMetrics(serviceName: string): MetricsRegistry {
  const registry = new Registry();
  registry.setDefaultLabels({ service: serviceName });

  collectDefaultMetrics({ register: registry });

  return {
    registry,

    counter(name, help, labelNames = []) {
      return new Counter({ name, help, labelNames, registers: [registry] });
    },

    gauge(name, help, labelNames = []) {
      return new Gauge({ name, help, labelNames, registers: [registry] });
    },

    histogram(name, help, labelNames = [], buckets) {
      return new Histogram({
        name,
        help,
        labelNames,
        buckets,
        registers: [registry],
      });
    },

    async metrics() {
      return registry.metrics();
    },

    contentType() {
      return registry.contentType;
    },
  };
}
