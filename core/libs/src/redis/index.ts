import Redis, { type Redis as RedisClient } from 'ioredis';

import type { AppConfig } from '../config';
import type { HealthCheckResult } from '../health';

export interface RedisWrapper {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  hset(key: string, field: string, value: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  hget(key: string, field: string): Promise<string | null>;
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: (msg: string) => void): Promise<void>;
  health(): Promise<HealthCheckResult>;
  close(): Promise<void>;
  raw(): RedisClient;
}

export function createRedis(config: AppConfig): RedisWrapper {
  const client = new Redis(config.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      return Math.min(times * 200, 3000);
    },
  });

  client.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[redis] error:', err.message);
  });

  return {
    async get(key) {
      return client.get(key);
    },

    async set(key, value, ttlSec) {
      if (ttlSec && ttlSec > 0) {
        await client.set(key, value, 'EX', ttlSec);
      } else {
        await client.set(key, value);
      }
    },

    async del(key) {
      await client.del(key);
    },

    async hset(key, field, value) {
      await client.hset(key, field, value);
    },

    async hgetall(key) {
      return client.hgetall(key);
    },

    async hget(key, field) {
      return client.hget(key, field);
    },

    async publish(channel, message) {
      await client.publish(channel, message);
    },

    async subscribe(channel, handler) {
      const sub = client.duplicate();
      await sub.subscribe(channel);
      sub.on('message', (_ch: string, msg: string) => handler(msg));
    },

    async health(): Promise<HealthCheckResult> {
      try {
        const pong = await client.ping();
        if (pong === 'PONG') {
          return { status: 'ok' };
        }
        return { status: 'degraded', message: `unexpected ping: ${pong}` };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { status: 'down', message };
      }
    },

    async close() {
      await client.quit();
    },

    raw() {
      return client;
    },
  };
}
