import type { RedisWrapper } from '@apiscloud/libs';
import { createRedisWriter } from '@apiscloud/data-writer';

interface MockRedisClient {
  readonly saddCalls: Array<{ key: string; member: string }>;
  readonly lpushCalls: Array<{ key: string; value: string }>;
  readonly ltrimCalls: Array<{ key: string; start: number; stop: number }>;
  sadd(key: string, member: string): Promise<number>;
  lpush(key: string, value: string): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<'OK'>;
}

interface MockRedis extends RedisWrapper {
  readonly sets: Array<{ key: string; value: string; ttl?: number }>;
  readonly hsets: Array<{ key: string; field: string; value: string }>;
  readonly mockClient: MockRedisClient;
}

function createMockRedis(): MockRedis {
  const sets: Array<{ key: string; value: string; ttl?: number }> = [];
  const hsets: Array<{ key: string; field: string; value: string }> = [];
  const saddCalls: Array<{ key: string; member: string }> = [];
  const lpushCalls: Array<{ key: string; value: string }> = [];
  const ltrimCalls: Array<{ key: string; start: number; stop: number }> = [];

  const mockClient: MockRedisClient = {
    saddCalls,
    lpushCalls,
    ltrimCalls,
    async sadd(key, member) {
      saddCalls.push({ key, member });
      return 1;
    },
    async lpush(key, value) {
      lpushCalls.push({ key, value });
      return 1;
    },
    async ltrim(key, start, stop) {
      ltrimCalls.push({ key, start, stop });
      return 'OK';
    },
  };

  return {
    sets,
    hsets,
    mockClient,
    async get() {
      return null;
    },
    async set(key, value, ttl) {
      sets.push({ key, value, ttl });
    },
    async del() {
      return;
    },
    async hset(key, field, value) {
      hsets.push({ key, field, value });
    },
    async hgetall() {
      return {};
    },
    async hget() {
      return null;
    },
    async publish() {
      return;
    },
    async subscribe() {
      return;
    },
    async health() {
      return { status: 'ok' as const };
    },
    async close() {
      return;
    },
    raw() {
      return mockClient as never;
    },
  };
}

describe('dataWriter.redisWriter', () => {
  const telemetry = {
    vehicle_id: 'v-000001',
    ts: Date.now(),
    lat: 31.23,
    lng: 121.47,
    speed: 30,
    battery: 80,
    heading: 90,
    status: 'running' as const,
  };

  it('writeVehicleLatest 写 latest JSON 带 TTL', async () => {
    const redis = createMockRedis();
    const writer = createRedisWriter(redis);

    await writer.writeVehicleLatest(telemetry, 60);

    const latestSet = redis.sets.find((s) => s.key === 'vehicle:v-000001:latest');
    expect(latestSet).toBeDefined();
    expect(latestSet!.ttl).toBe(60);
    expect(JSON.parse(latestSet!.value)).toEqual(telemetry);
  });

  it('writeVehicleLatest 写 hash 字段', async () => {
    const redis = createMockRedis();
    const writer = createRedisWriter(redis);

    await writer.writeVehicleLatest(telemetry, 60);

    const fields = redis.hsets
      .filter((h) => h.key === 'vehicle:v-000001')
      .map((h) => h.field);
    expect(fields).toContain('status');
    expect(fields).toContain('battery');
    expect(fields).toContain('lat');
    expect(fields).toContain('lng');
    expect(fields).toContain('heading');
    expect(fields).toContain('speed');
    expect(fields).toContain('updated_at');
  });

  it('writeVehicleLatest 加到活跃集合', async () => {
    const redis = createMockRedis();
    const writer = createRedisWriter(redis);

    await writer.writeVehicleLatest(telemetry, 60);

    expect(redis.mockClient.saddCalls).toEqual([
      { key: 'vehicles:active', member: 'v-000001' },
    ]);
  });

  it('writeRecentAlert 推入列表并裁剪', async () => {
    const redis = createMockRedis();
    const writer = createRedisWriter(redis);

    await writer.writeRecentAlert(
      {
        vehicle_id: 'v-000001',
        alert_type: 'speed',
        level: 'warning',
        message: 'x',
      },
      100,
    );

    expect(redis.mockClient.lpushCalls).toHaveLength(1);
    expect(redis.mockClient.lpushCalls[0].key).toBe('alerts:recent');
    expect(redis.mockClient.ltrimCalls).toEqual([
      { key: 'alerts:recent', start: 0, stop: 99 },
    ]);
  });

  it('writeRecentAlert 尊重 maxCount', async () => {
    const redis = createMockRedis();
    const writer = createRedisWriter(redis);

    await writer.writeRecentAlert(
      {
        vehicle_id: 'v-000001',
        alert_type: 'speed',
        level: 'warning',
        message: 'x',
      },
      50,
    );

    expect(redis.mockClient.ltrimCalls[0].stop).toBe(49);
  });

  it('writeRegionStats 写区域 hash', async () => {
    const redis = createMockRedis();
    const writer = createRedisWriter(redis);

    await writer.writeRegionStats({
      region: 'east',
      window_start: 1000,
      window_end: 2000,
      vehicle_count: 50,
      avg_speed: 35,
      avg_battery: 70,
    });

    const fields = redis.hsets
      .filter((h) => h.key === 'region:east:stats')
      .map((h) => h.field);
    expect(fields).toContain('window_start');
    expect(fields).toContain('window_end');
    expect(fields).toContain('vehicle_count');
    expect(fields).toContain('avg_speed');
    expect(fields).toContain('avg_battery');
  });
});
