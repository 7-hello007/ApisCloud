import {
  createMqtt,
  type AppConfig,
  type HealthCheckResult,
  type MqttWrapper,
} from '@apiscloud/libs';

import { parseEnvelope, serializeEnvelope, type Envelope } from '../envelope';
import type {
  MessageBus,
  MessageHandler,
  PublishOptions,
  SubscribeOptions,
  Subscription,
} from '../interface';

export class MqttAdapter implements MessageBus {
  readonly type = 'mqtt' as const;

  private readonly client: MqttWrapper;
  private connected = false;

  constructor(config: AppConfig) {
    this.client = createMqtt(config);
  }

  async connect(): Promise<void> {
    // 委托给 wrapper 的 connect，wrapper 内部已处理 manualConnect 和超时
    await this.client.connect();
    this.connected = true;
  }

  async publish(topic: string, env: Envelope, _options?: PublishOptions): Promise<void> {
    this.ensureConnected();
    await this.client.publish(topic, serializeEnvelope(env), 1);
  }

  async subscribe(
    topic: string,
    handler: MessageHandler,
    options?: SubscribeOptions,
  ): Promise<Subscription> {
    this.ensureConnected();

    const client = this.client;

    await client.subscribe(
      topic,
      async (_t: string, payload: Buffer) => {
        try {
          const env = parseEnvelope(payload);
          if (options?.filter && !options.filter(env)) {
            return;
          }
          await handler(env);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error(`[mqtt-adapter] 消息处理失败 topic=${topic}: ${message}`);
        }
      },
      1,
    );

    return {
      topic,
      async unsubscribe() {
        await new Promise<void>((resolve) => {
          client.raw().unsubscribe(topic, () => resolve());
        });
      },
    };
  }

  async commit(_topic: string, _offset: string): Promise<void> {
    // MQTT 无消费位点，空实现
  }

  async health(): Promise<HealthCheckResult> {
    return this.client.health();
  }

  async close(): Promise<void> {
    await this.client.close();
    this.connected = false;
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('MQTT MessageBus 未连接，请先调用 connect()');
    }
  }
}
