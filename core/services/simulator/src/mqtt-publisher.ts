import {
  createMqtt,
  type AppConfig,
  type HealthCheckResult,
  type MqttWrapper,
} from '@apiscloud/libs';

import type { VehicleState } from './types';

export interface MqttPublisher {
  connect(): Promise<void>;
  publish(state: VehicleState): Promise<void>;
  health(): Promise<HealthCheckResult>;
  close(): Promise<void>;
}

/**
 * 创建 MQTT 发布器。
 * 复用 @apiscloud/libs 的 MQTT 封装。
 */
export function createMqttPublisher(config: AppConfig, topic: string): MqttPublisher {
  const client: MqttWrapper = createMqtt(config);

  return {
    async connect() {
      await client.connect();
    },

    async publish(state) {
      await client.publish(topic, JSON.stringify(state), 1);
    },

    async health() {
      return client.health();
    },

    async close() {
      await client.close();
    },
  };
}
