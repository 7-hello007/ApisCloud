import type { HealthCheckResult } from '@apiscloud/libs';

import type { Envelope } from './envelope';

export interface SubscribeOptions {
  /** 消费者组（Kafka 用） */
  groupId?: string;
  /** 是否只接收自己关心的消息，返回 false 则跳过 */
  filter?: (env: Envelope) => boolean;
  /** 分区键（Kafka 用） */
  partitionKey?: string;
}

export interface Subscription {
  /** 取消订阅 */
  unsubscribe(): Promise<void>;
  /** 主题名 */
  topic: string;
}

export type MessageHandler = (env: Envelope) => Promise<void>;

export interface PublishOptions {
  /** 分区键（Kafka 用） */
  partitionKey?: string;
  /** 消息 key（MQTT 用） */
  key?: string;
}

export interface MessageBus {
  /** 总线类型标识 */
  readonly type: 'memory' | 'mqtt' | 'kafka';

  /** 连接总线 */
  connect(): Promise<void>;

  /** 发布消息 */
  publish(topic: string, env: Envelope, options?: PublishOptions): Promise<void>;

  /** 订阅消息 */
  subscribe(
    topic: string,
    handler: MessageHandler,
    options?: SubscribeOptions,
  ): Promise<Subscription>;

  /** 提交消费位点（Kafka 用，MQTT/Memory 为空实现） */
  commit(topic: string, offset: string): Promise<void>;

  /** 健康检查 */
  health(): Promise<HealthCheckResult>;

  /** 关闭总线 */
  close(): Promise<void>;
}
