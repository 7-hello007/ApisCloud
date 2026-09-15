'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.createRedis = createRedis;
const ioredis_1 = __importDefault(require('ioredis'));
function createRedis(config) {
  const client = new ioredis_1.default(config.REDIS_URL, {
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
      sub.on('message', (_ch, msg) => handler(msg));
    },
    async health() {
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
//# sourceMappingURL=index.js.map
