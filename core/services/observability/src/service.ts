import type { Logger } from '@apiscloud/libs';

import { createObservabilityHealth, type ObservableTarget } from './health';
import { createObservabilityLogger } from './logger';
import { createObservabilityMetrics, type ObservabilityMetrics } from './metrics';
import { createServer, type ObservabilityServer } from './server';
import { Tracer } from './tracing';
import type { ObservabilityOptions } from './types';

/**
 * 可观测性服务。
 * 组合 metrics、health、logger、tracer、server，对外提供统一接口。
 *
 * 用法：
 *   const svc = createObservabilityService({ service: 'ingest', port: 9103 });
 *   svc.addHealthTarget({ name: 'mqtt', check: async () => ({ status: 'ok' }) });
 *   await svc.start();
 *   // ... 业务
 *   await svc.stop();
 */
export interface ObservabilityService {
  readonly logger: Logger;
  readonly metrics: ObservabilityMetrics;
  readonly tracer: Tracer;
  readonly port: number;

  /** 注册额外健康检查 */
  addHealthTarget(target: ObservableTarget): void;

  /** 启动 HTTP 服务器 */
  start(): Promise<void>;

  /** 停止 HTTP 服务器 */
  stop(): Promise<void>;
}

export function createObservabilityService(
  options: ObservabilityOptions,
): ObservabilityService {
  const logger =
    options.logger ??
    createObservabilityLogger({
      service: options.service,
      layer: options.layer,
      level: options.logLevel,
      pretty: options.prettyLogs,
    });

  const metrics = createObservabilityMetrics(options.service);

  const healthTargets: ObservableTarget[] = [];
  const health = createObservabilityHealth(options.service, healthTargets);

  const tracer = new Tracer(logger);

  const server: ObservabilityServer = createServer({
    port: options.port,
    service: options.service,
    logger,
    metrics,
    health,
  });

  return {
    logger,
    metrics,
    tracer,

    get port() {
      return server.port();
    },

    addHealthTarget(target) {
      healthTargets.push(target);
      health.register(target.name, target.check);
    },

    async start() {
      await server.start();
    },

    async stop() {
      await server.stop();
    },
  };
}
