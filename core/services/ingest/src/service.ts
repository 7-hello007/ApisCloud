import type { AppConfig } from '@apiscloud/libs';
import {
  createMessageBus,
  TOPICS,
  type Envelope,
  type MessageBus,
  type Subscription,
} from '@apiscloud/message-bus';
import {
  createObservabilityService,
  type ObservabilityService,
} from '@apiscloud/observability';

import { createBusPublisher } from './bus-publisher';
import { createBusSubscriber } from './bus-subscriber';
import { loadIngestConfig } from './config';
import { envelopeToCommand, telemetryToEnvelope } from './mapper';
import { createMqttPublisher, type MqttPublisher } from './mqtt-publisher';
import { createMqttSubscriber, type MqttSubscriber } from './mqtt-subscriber';
import type { IngestConfig } from './types';
import { DownlinkCommandSchema, UplinkTelemetrySchema } from './validation';

export interface IngestServiceOptions {
  config: AppConfig;
  port: number;
  /** 可注入的 MQTT 订阅器（测试用） */
  mqttSubscriber?: MqttSubscriber;
  /** 可注入的 MQTT 发布器（测试用） */
  mqttPublisher?: MqttPublisher;
  /** 可注入的 MessageBus（测试用） */
  bus?: MessageBus;
}

export interface IngestService {
  readonly observability: ObservabilityService;
  readonly ingestConfig: IngestConfig;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * 创建 ingest 服务。
 * 组合：配置 + MQTT 订阅/发布 + 总线发布/订阅 + 可观测性。
 */
export function createIngestService(options: IngestServiceOptions): IngestService {
  const ingestConfig = loadIngestConfig(options.config);

  const observability = createObservabilityService({
    service: 'ingest',
    layer: options.config.LAYER,
    port: options.port,
    logLevel: options.config.LOG_LEVEL,
    prettyLogs: options.config.NODE_ENV === 'development',
  });

  const bus = options.bus ?? createMessageBus(options.config);
  const mqttSubscriber = options.mqttSubscriber ?? createMqttSubscriber(options.config);
  const mqttPublisher = options.mqttPublisher ?? createMqttPublisher(options.config);

  const busPublisher = createBusPublisher(bus);
  const busSubscriber = createBusSubscriber(bus);

  const subscriptions: Subscription[] = [];
  let stopped = false;

  /**
   * 上行处理：MQTT payload → 校验 → Envelope → 总线。
   */
  async function handleUplink(payload: Buffer): Promise<void> {
    try {
      const raw = JSON.parse(payload.toString('utf-8'));
      const parsed = UplinkTelemetrySchema.safeParse(raw);
      if (!parsed.success) {
        observability.logger.warn(
          { issues: parsed.error.issues },
          '上行数据校验失败',
        );
        return;
      }

      const env = telemetryToEnvelope(parsed.data);
      await busPublisher.publish(TOPICS.TELEMETRY_RAW, env, parsed.data.vehicle_id);

      observability.metrics.dataFlowMessages.inc({
        topic: TOPICS.TELEMETRY_RAW,
        direction: 'in',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      observability.logger.error({ err: message }, '上行处理失败');
    }
  }

  /**
   * 下行处理：总线 Envelope → 校验 → MQTT。
   */
  async function handleDownlink(env: Envelope): Promise<void> {
    try {
      const parsed = DownlinkCommandSchema.safeParse(env.payload);
      if (!parsed.success) {
        observability.logger.warn(
          { issues: parsed.error.issues },
          '下行命令校验失败',
        );
        return;
      }

      const cmd = envelopeToCommand(env);
      const mqttTopic = `${ingestConfig.mqttCommandPrefix}${cmd.vehicle_id}`;

      await mqttPublisher.publish(mqttTopic, cmd);

      observability.metrics.dataFlowMessages.inc({
        topic: TOPICS.EVENTS_COMMANDS,
        direction: 'out',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      observability.logger.error({ err: message }, '下行处理失败');
    }
  }

  return {
    observability,
    ingestConfig,

    async start() {
      await bus.connect();
      await mqttSubscriber.connect();
      await mqttPublisher.connect();
      await observability.start();

      await mqttSubscriber.subscribe(ingestConfig.mqttUplinkTopic, (payload) => {
        void handleUplink(payload);
      });

      const sub = await busSubscriber.subscribe(
        TOPICS.EVENTS_COMMANDS,
        ingestConfig.consumerGroup,
        handleDownlink,
      );
      subscriptions.push(sub);

      observability.addHealthTarget({
        name: 'mqtt',
        check: async () => mqttSubscriber.health(),
      });

      observability.addHealthTarget({
        name: 'bus',
        check: async () => bus.health(),
      });

      observability.logger.info(
        {
          mqttUplinkTopic: ingestConfig.mqttUplinkTopic,
          mqttCommandPrefix: ingestConfig.mqttCommandPrefix,
          busUplinkTopic: TOPICS.TELEMETRY_RAW,
          busCommandTopic: TOPICS.EVENTS_COMMANDS,
        },
        'ingest 服务已启动',
      );
    },

    async stop() {
      if (stopped) return;
      stopped = true;

      for (const sub of subscriptions) {
        await sub.unsubscribe();
      }
      subscriptions.length = 0;

      await mqttSubscriber.close();
      await mqttPublisher.close();
      await bus.close();
      await observability.stop();

      observability.logger.info('ingest 服务已停止');
    },
  };
}