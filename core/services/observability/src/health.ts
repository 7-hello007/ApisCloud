import { createHealthRegistry, type HealthRegistry } from '@apiscloud/libs';

export interface ObservableTarget {
  name: string;
  check: () => Promise<{ status: 'ok' | 'degraded' | 'down'; message?: string }>;
}

/**
 * 创建可观测性健康注册中心。
 * 默认注册一个自身检查，其他检查由外部注入。
 */
export function createObservabilityHealth(
  service: string,
  targets: ObservableTarget[] = [],
): HealthRegistry {
  const registry = createHealthRegistry(service);

  registry.register('self', async () => ({
    status: 'ok',
    message: 'observability service running',
  }));

  for (const target of targets) {
    registry.register(target.name, target.check);
  }

  return registry;
}
