import type { Envelope, MessageBus, Subscription } from '@apiscloud/message-bus';

export type BusMessageHandler = (env: Envelope) => Promise<void>;

export interface BusSubscriber {
  subscribe(topic: string, groupId: string, handler: BusMessageHandler): Promise<Subscription>;
}

/**
 * 总线订阅器。
 */
export function createBusSubscriber(bus: MessageBus): BusSubscriber {
  return {
    async subscribe(topic, groupId, handler) {
      return bus.subscribe(topic, handler, { groupId });
    },
  };
}
