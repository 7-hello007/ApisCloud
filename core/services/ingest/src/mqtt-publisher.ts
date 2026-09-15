import {
  createMqtt,
  type AppConfig,
  type HealthCheckResult,
  type MqttWrapper,
} from '@apiscloud/libs';

export interface MqttPublisher {
  connect(): Promise<void>;
  publish(topic: string, payload: unknown): Promise<void>;
  health(): Promise<HealthCheckResult>;
  close(): Promise<void>;
}

/**
 * MQTT 发布器。
 * 与 MqttSubscriber 独立连接，避免订阅/发布互相影响。
 */
export function createMqttPublisher(config: AppConfig): MqttPublisher {
  const client: MqttWrapper = createMqtt(config);

  return {
    async connect() {
      await client.connect();
    },

    async publish(topic, payload) {
      await client.publish(topic, JSON.stringify(payload), 1);
    },

    async health() {
      return client.health();
    },

    async close() {
      await client.close();
    },
  };
}
