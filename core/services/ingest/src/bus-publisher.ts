import type { Envelope, MessageBus } from '@apiscloud/message-bus';

export interface BusPublisher {
  publish(topic: string, env: Envelope, partitionKey?: string): Promise<void>;
}

/**
 * 总线发布器。
 * 封装 MessageBus.publish，默认 partitionKey 用 source。
 */
export function createBusPublisher(bus: MessageBus): BusPublisher {
  return {
    async publish(topic, env, partitionKey) {
      await bus.publish(topic, env, {
        partitionKey: partitionKey ?? env.source,
      });
    },
  };
}