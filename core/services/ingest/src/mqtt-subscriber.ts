import {
  createMqtt,
  type AppConfig,
  type HealthCheckResult,
  type MqttWrapper,
} from '@apiscloud/libs';

export type MqttMessageHandler = (payload: Buffer) => void;

export interface MqttSubscriber {
  connect(): Promise<void>;
  subscribe(topic: string, handler: MqttMessageHandler): Promise<void>;
  health(): Promise<HealthCheckResult>;
  close(): Promise<void>;
}

/**
 * MQTT 订阅器。
 * 复用 @apiscloud/libs 的 MQTT 封装，屏蔽底层细节。
 */
export function createMqttSubscriber(config: AppConfig): MqttSubscriber {
  const client: MqttWrapper = createMqtt(config);

  return {
    async connect() {
      await client.connect();
    },

    async subscribe(topic, handler) {
      await client.subscribe(
        topic,
        (_t: string, payload: Buffer) => {
          handler(payload);
        },
        1,
      );
    },

    async health() {
      return client.health();
    },

    async close() {
      await client.close();
    },
  };
}
