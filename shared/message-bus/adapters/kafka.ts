import type { HealthCheckResult } from '@apiscloud/libs';
import { Kafka, type Consumer, type Producer } from 'kafkajs';
import type { AppConfig } from '@apiscloud/libs';

import { parseEnvelope, serializeEnvelope, type Envelope } from '../envelope';
import type {
  MessageBus,
  MessageHandler,
  PublishOptions,
  SubscribeOptions,
  Subscription,
} from '../interface';

/**
 * Kafka 适配器。
 * 支持消费者组、分区键、消费位点提交。
 */
export class KafkaAdapter implements MessageBus {
  readonly type = 'kafka' as const;

  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private readonly consumers = new Map<string, Consumer>();
  private connected = false;

  constructor(config: AppConfig) {
    const brokers = config.KAFKA_BROKERS.split(',').map((b) => b.trim());
    this.kafka = new Kafka({
      clientId: config.KAFKA_CLIENT_ID,
      brokers,
    });
  }

  async connect(): Promise<void> {
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.connected = true;
  }

  async publish(topic: string, env: Envelope, options?: PublishOptions): Promise<void> {
    this.ensureConnected();
    if (!this.producer) {
      throw new Error('Kafka producer 未初始化');
    }
    await this.producer.send({
      topic,
      messages: [
        {
          key: options?.partitionKey ?? env.source,
          value: serializeEnvelope(env),
        },
      ],
    });
  }

  async subscribe(
    topic: string,
    handler: MessageHandler,
    options?: SubscribeOptions,
  ): Promise<Subscription> {
    this.ensureConnected();

    const consumers = this.consumers;
    const groupId = options?.groupId ?? `apiscloud-${topic.replace(/\./g, '-')}`;
    const consumer = this.kafka.consumer({ groupId });

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        try {
          const env = parseEnvelope(message.value);
          if (options?.filter && !options.filter(env)) {
            return;
          }
          await handler(env);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error(`[kafka-adapter] 消息处理失败 topic=${topic}: ${msg}`);
        }
      },
    });

    const consumerKey = `${groupId}:${topic}`;
    consumers.set(consumerKey, consumer);

    return {
      topic,
      async unsubscribe() {
        await consumer.disconnect();
        consumers.delete(consumerKey);
      },
    };
  }

  async commit(_topic: string, _offset: string): Promise<void> {
    // kafkajs 的 eachMessage 自动提交位点，无需手动提交
    // 如需手动提交，改为 eachBatch + autoCommit: false
  }

  async health(): Promise<HealthCheckResult> {
    if (!this.connected) {
      return { status: 'down', message: 'not connected' };
    }
    try {
      const admin = this.kafka.admin();
      await admin.connect();
      await admin.listTopics();
      await admin.disconnect();
      return { status: 'ok' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'down', message };
    }
  }

  async close(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
    for (const consumer of this.consumers.values()) {
      await consumer.disconnect();
    }
    this.consumers.clear();
    this.connected = false;
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Kafka MessageBus 未连接，请先调用 connect()');
    }
  }
}
