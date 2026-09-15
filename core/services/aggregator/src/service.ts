import type { AppConfig } from '@apiscloud/libs';
import {
  createMessageBus,
  TOPICS,
  type Envelope,
  type MessageBus,
  type Subscription,
} from '@apiscloud/message-bus';
import { createObservabilityService, type ObservabilityService } from '@apiscloud/observability';

import { aggregate } from './aggregator';
import { loadAggregatorConfig } from './config';
import { aggregatedToEnvelope, extractTelemetryRaw } from './mapper';
import type { AggregatorConfig } from './types';
import { AggregationWindow } from './window';

export interface AggregatorServiceOptions {
  config: AppConfig;
  port: number;
  /** 可注入的 MessageBus（测试用） */
  bus?: MessageBus;
  /** 可注入的聚合窗口（测试用） */
  window?: AggregationWindow;
}

export interface AggregatorService {
  readonly observability: ObservabilityService;
  readonly aggregatorConfig: AggregatorConfig;
  readonly window: AggregationWindow;
  /** 手动触发一次聚合，供测试用 */
  flush(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * 创建 aggregator 服务。
 * 组合：配置 + 总线 + 时间窗 + 可观测性 + 定时器。
 */
export function createAggregatorService(options: AggregatorServiceOptions): AggregatorService {
  const cfg = loadAggregatorConfig(options.config);

  const observability = createObservabilityService({
    service: 'aggregator',
    layer: options.config.LAYER,
    port: options.port,
    logLevel: options.config.LOG_LEVEL,
    prettyLogs: options.config.NODE_ENV === 'development',
  });

  const bus = options.bus ?? createMessageBus(options.config);
  const window = options.window ?? new AggregationWindow();

  const subscriptions: Subscription[] = [];
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  /**
   * 处理一条遥测。
   */
  async function onTelemetryRaw(env: Envelope): Promise<void> {
    try {
      const payload = extractTelemetryRaw(env);
      window.push(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      observability.logger.error({ err: message }, '遥测处理失败');
    }
  }

  /**
   * 执行一次聚合，发 telemetry.aggregated。
   */
  async function flush(): Promise<void> {
    const snapshots = window.drain();
    const windowEnd = Date.now();
    const windowStart = windowEnd - cfg.windowMs;

    const payload = aggregate({
      snapshots,
      windowStart,
      windowEnd,
      region: cfg.region,
      regionCenter: { lat: cfg.regionCenterLat, lng: cfg.regionCenterLng },
      lowBatteryThreshold: cfg.lowBatteryThreshold,
    });

    try {
      const env = aggregatedToEnvelope(payload);
      await bus.publish(TOPICS.TELEMETRY_AGGREGATED, env, {
        partitionKey: cfg.region,
      });

      observability.metrics.dataFlowMessages.inc({
        topic: TOPICS.TELEMETRY_AGGREGATED,
        direction: 'out',
      });

      observability.logger.debug(
        {
          vehicleCount: payload.vehicle_count,
          lowBatteryCount: payload.low_battery_vehicles.length,
          idleCount: payload.idle_vehicles.length,
        },
        '聚合完成',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      observability.logger.error({ err: message }, '聚合发布失败');
    }
  }

  return {
    observability,
    aggregatorConfig: cfg,
    window,

    async flush() {
      await flush();
    },

    async start() {
      await bus.connect();
      await observability.start();

      const sub = await bus.subscribe(TOPICS.TELEMETRY_RAW, onTelemetryRaw, {
        groupId: cfg.consumerGroup,
      });
      subscriptions.push(sub);

      // 定时聚合
      timer = setInterval(() => {
        void flush();
      }, cfg.windowMs);

      observability.addHealthTarget({
        name: 'bus',
        check: async () => bus.health(),
      });

      observability.addHealthTarget({
        name: 'window',
        check: async () => ({
          status: 'ok',
          message: `buffered: ${window.size()}`,
        }),
      });

      observability.logger.info(
        {
          consumerGroup: cfg.consumerGroup,
          windowMs: cfg.windowMs,
          lowBatteryThreshold: cfg.lowBatteryThreshold,
          region: cfg.region,
        },
        'aggregator 已启动',
      );
    },

    async stop() {
      if (stopped) return;
      stopped = true;

      if (timer) {
        clearInterval(timer);
        timer = null;
      }

      for (const sub of subscriptions) {
        await sub.unsubscribe();
      }
      subscriptions.length = 0;

      await bus.close();
      await observability.stop();

      observability.logger.info('aggregator 已停止');
    },
  };
}
