export const MESSAGE_BUS_VERSION = '0.1.0';

// 主题
export { TOPICS, ALL_TOPICS } from './topics';
export type { TopicName } from './topics';

// 信封
export {
  EnvelopeSchema,
  createEnvelope,
  validateEnvelope,
  parseEnvelope,
  serializeEnvelope,
} from './envelope';
export type { Envelope, CreateEnvelopeOptions } from './envelope';

// 接口
export type {
  MessageBus,
  MessageHandler,
  PublishOptions,
  SubscribeOptions,
  Subscription,
} from './interface';

// 适配器
export { MemoryAdapter } from './adapters/memory';
export { MqttAdapter } from './adapters/mqtt';
export { KafkaAdapter } from './adapters/kafka';

// 工厂
export { createMessageBus } from './factory';
