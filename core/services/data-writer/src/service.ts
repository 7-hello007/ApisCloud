import {
  createPg,
  createRedis,
  type AppConfig,
  type PgClient,
  type RedisWrapper,
} from '@apiscloud/libs';
import {
  createMessageBus,
  TOPICS,
  type Envelope,
  type MessageBus,
  type Subscription,
} from '@apiscloud/message-bus';
import { createObservabilityService, type ObservabilityService } from '@apiscloud/observability';

import { loadDataWriterConfig } from './config';
import { handleEventsAlerts } from './handlers/events-alerts';
import { handleEventsCommands } from './handlers/events-commands';
import { handleTelemetryAggregated } from './handlers/telemetry-aggregated';
import { handleTelemetryRaw } from './handlers/telemetry-raw';
import { createPgWriter, type PgWriter } from './pg-writer';
import { createRedisWriter, type RedisWriter } from './redis-writer';
import { createDataWriterServer, type DataWriterServer } from './server';
import type { DataWriterConfig } from './types';

export interface DataWriterServiceOptions {
  config: AppConfig;
  port: number;
  pg?: PgClient;
  redis?: RedisWrapper;
  bus?: MessageBus;
}

export interface DataWriterService {
  readonly observability: ObservabilityService;
  readonly dataWriterConfig: DataWriterConfig;
  port(): number;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createDataWriterService(options: DataWriterServiceOptions): DataWriterService {
  const dwConfig = loadDataWriterConfig(options.config);

  const observability = createObservabilityService({
    service: 'data-writer',
    layer: options.config.LAYER,
    port: options.port,
    logLevel: options.config.LOG_LEVEL,
    prettyLogs: options.config.NODE_ENV === 'development',
  });

  const bus = options.bus ?? createMessageBus(options.config);
  const pg = options.pg ?? createPg(options.config);
  const redis = options.redis ?? createRedis(options.config);

  const pgWriter: PgWriter = createPgWriter(pg);
  const redisWriter: RedisWriter = createRedisWriter(redis);

  const subscriptions: Subscription[] = [];
  let stopped = false;

  async function onTelemetryRaw(env: Envelope): Promise<void> {
    try {
      await handleTelemetryRaw(env, {
        pgWriter,
        redisWriter,
        logger: observability.logger,
        metrics: observability.metrics,
        config: dwConfig,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      observability.logger.error({ err: message }, 'telemetry.raw 处理失败');
    }
  }

  async function onTelemetryAggregated(env: Envelope): Promise<void> {
    try {
      await handleTelemetryAggregated(env, {
        redisWriter,
        logger: observability.logger,
        metrics: observability.metrics,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      observability.logger.error({ err: message }, 'telemetry.aggregated 处理失败');
    }
  }

  async function onEventsAlerts(env: Envelope): Promise<void> {
    try {
      await handleEventsAlerts(env, {
        pgWriter,
        redisWriter,
        logger: observability.logger,
        metrics: observability.metrics,
        config: dwConfig,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      observability.logger.error({ err: message }, 'events.alerts 处理失败');
    }
  }

  async function onEventsCommands(env: Envelope): Promise<void> {
    try {
      await handleEventsCommands(env, {
        pgWriter,
        logger: observability.logger,
        metrics: observability.metrics,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      observability.logger.error({ err: message }, 'events.commands 处理失败');
    }
  }

  const server: DataWriterServer = createDataWriterServer({
    port: options.port,
    service: 'data-writer',
    logger: observability.logger,
    metrics: observability.metrics,
    redis,
    pg,
    config: dwConfig,
  });

  return {
    observability,
    dataWriterConfig: dwConfig,

    port() {
      return server.port();
    },

    async start() {
      await bus.connect();
      // 不启动 observability 的 HTTP 服务器，用 data-writer 自己的
      await server.start();

      const sub1 = await bus.subscribe(TOPICS.TELEMETRY_RAW, onTelemetryRaw, {
        groupId: dwConfig.consumerGroup,
      });
      subscriptions.push(sub1);

      const sub2 = await bus.subscribe(TOPICS.TELEMETRY_AGGREGATED, onTelemetryAggregated, {
        groupId: dwConfig.consumerGroup,
      });
      subscriptions.push(sub2);

      const sub3 = await bus.subscribe(TOPICS.EVENTS_ALERTS, onEventsAlerts, {
        groupId: dwConfig.consumerGroup,
      });
      subscriptions.push(sub3);

      const sub4 = await bus.subscribe(TOPICS.EVENTS_COMMANDS, onEventsCommands, {
        groupId: dwConfig.consumerGroup,
      });
      subscriptions.push(sub4);

      observability.logger.info(
        {
          consumerGroup: dwConfig.consumerGroup,
          port: server.port(),
          topics: [
            TOPICS.TELEMETRY_RAW,
            TOPICS.TELEMETRY_AGGREGATED,
            TOPICS.EVENTS_ALERTS,
            TOPICS.EVENTS_COMMANDS,
          ],
        },
        'data-writer 服务已启动',
      );
    },

    async stop() {
      if (stopped) return;
      stopped = true;

      for (const sub of subscriptions) {
        await sub.unsubscribe();
      }
      subscriptions.length = 0;

      await server.stop();
      await bus.close();
      await pg.close();
      await redis.close();

      observability.logger.info('data-writer 服务已停止');
    },
  };
}
