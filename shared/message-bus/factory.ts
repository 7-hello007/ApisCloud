import type { AppConfig } from '@apiscloud/libs';

import { KafkaAdapter } from './adapters/kafka';
import { MemoryAdapter } from './adapters/memory';
import { MqttAdapter } from './adapters/mqtt';
import type { MessageBus } from './interface';

/**
 * 按配置创建消息总线实例。
 * MESSAGE_BUS=memory | mqtt | kafka
 */
export function createMessageBus(config: AppConfig): MessageBus {
  switch (config.MESSAGE_BUS) {
    case 'memory':
      return new MemoryAdapter();
    case 'mqtt':
      return new MqttAdapter(config);
    case 'kafka':
      return new KafkaAdapter(config);
    default: {
      const _exhaustive: never = config.MESSAGE_BUS;
      throw new Error(`未知消息总线类型：${String(_exhaustive)}`);
    }
  }
}
