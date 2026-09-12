import type { HealthCheckResult } from '@apiscloud/libs';

import type { Envelope } from '../envelope';
import type {
  MessageBus,
  MessageHandler,
  PublishOptions,
  SubscribeOptions,
  Subscription,
} from '../interface';

interface MemorySubscription {
  topic: string;
  handler: MessageHandler;
  filter?: (env: Envelope) => boolean;
}

/**
 * 内存适配器。
 * 用于单元测试和演示环境，不需要真实总线。
 */
export class MemoryAdapter implements MessageBus {
  readonly type = 'memory' as const;

  private connected = false;
  private readonly subscriptions = new Map<string, Set<MemorySubscription>>();

  async connect(): Promise<void> {
    this.connected = true;
  }

  async publish(topic: string, env: Envelope, _options?: PublishOptions): Promise<void> {
    this.ensureConnected();

    const subs = this.subscriptions.get(topic);
    if (!subs || subs.size === 0) {
      return;
    }

    await Promise.all(
      Array.from(subs).map(async (sub) => {
        if (sub.filter && !sub.filter(env)) {
          return;
        }
        await sub.handler(env);
      }),
    );
  }

  async subscribe(
    topic: string,
    handler: MessageHandler,
    options?: SubscribeOptions,
  ): Promise<Subscription> {
    this.ensureConnected();

    const sub: MemorySubscription = {
      topic,
      handler,
      filter: options?.filter,
    };

    let subs = this.subscriptions.get(topic);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(topic, subs);
    }
    subs.add(sub);

    return {
      topic,
      async unsubscribe() {
        subs?.delete(sub);
      },
    };
  }

  async commit(_topic: string, _offset: string): Promise<void> {
    // Memory 适配器无消费位点，空实现
  }

  async health(): Promise<HealthCheckResult> {
    if (!this.connected) {
      return { status: 'down', message: 'not connected' };
    }
    return {
      status: 'ok',
      message: `subscriptions: ${this.totalSubscriptions()}`,
    };
  }

  async close(): Promise<void> {
    this.subscriptions.clear();
    this.connected = false;
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('MessageBus 未连接，请先调用 connect()');
    }
  }

  private totalSubscriptions(): number {
    let total = 0;
    for (const subs of this.subscriptions.values()) {
      total += subs.size;
    }
    return total;
  }
}
