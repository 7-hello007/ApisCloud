import type {
  HealthCheckResult,
  PgClient,
  RedisWrapper,
} from '@apiscloud/libs';

// ============================================================
// Mock PG
// ============================================================

export interface MockPgQuery {
  sql: string;
  params?: unknown[];
}

export interface MockPgQueryOverride {
  (sql: string, params?: unknown[]): Promise<unknown>;
}

export interface MockPg extends PgClient {
  readonly queries: MockPgQuery[];
  /** 按 SQL 关键字过滤 */
  queriesBySql(keyword: string): MockPgQuery[];
  /** 清空所有 query */
  reset(): void;
  /** 设置查询返回，仍会推入 queries 数组 */
  setQueryOverride(fn: MockPgQueryOverride): void;
  /** 清掉覆盖 */
  clearQueryOverride(): void;
}

export function createMockPg(): MockPg {
  const queries: MockPgQuery[] = [];
  let override: MockPgQueryOverride | null = null;

  return {
    queries,

    queriesBySql(keyword: string): MockPgQuery[] {
      return queries.filter((q) => q.sql.includes(keyword));
    },

    reset() {
      queries.length = 0;
    },

    setQueryOverride(fn: MockPgQueryOverride) {
      override = fn;
    },

    clearQueryOverride() {
      override = null;
    },

    async query(sql: string, params?: unknown[]) {
      // 关键：无论是否覆盖，都推入 queries 数组
      queries.push({ sql, params });
      if (override) {
        return (await override(sql, params)) as never;
      }
      return { rows: [], rowCount: 0 } as never;
    },

    async transaction() {
      throw new Error('transaction not implemented in mock');
    },

    async health(): Promise<HealthCheckResult> {
      return { status: 'ok' };
    },

    async close() {},

    raw() {
      throw new Error('raw not implemented in mock');
    },
  } as unknown as MockPg;
}

// ============================================================
// Mock Redis
// ============================================================

export interface MockRedisSet {
  key: string;
  value: string;
  ttl?: number;
}

export interface MockRedisHset {
  key: string;
  field: string;
  value: string;
}

export interface MockRedisSadd {
  key: string;
  member: string;
}

export interface MockRedisLpush {
  key: string;
  value: string;
}

export interface MockRedisLtrim {
  key: string;
  start: number;
  stop: number;
}

export interface MockRedis extends RedisWrapper {
  readonly sets: MockRedisSet[];
  readonly hsets: MockRedisHset[];
  readonly sadds: MockRedisSadd[];
  readonly lpushes: MockRedisLpush[];
  readonly ltrims: MockRedisLtrim[];
  reset(): void;
}

export function createMockRedis(): MockRedis {
  const sets: MockRedisSet[] = [];
  const hsets: MockRedisHset[] = [];
  const sadds: MockRedisSadd[] = [];
  const lpushes: MockRedisLpush[] = [];
  const ltrims: MockRedisLtrim[] = [];

  return {
    sets,
    hsets,
    sadds,
    lpushes,
    ltrims,

    reset() {
      sets.length = 0;
      hsets.length = 0;
      sadds.length = 0;
      lpushes.length = 0;
      ltrims.length = 0;
    },

    async get() {
      return null;
    },
    async set(key, value, ttl) {
      sets.push({ key, value, ttl });
    },
    async del() {},
    async hset(key, field, value) {
      hsets.push({ key, field, value });
    },
    async hgetall() {
      return {};
    },
    async hget() {
      return null;
    },
    async publish() {},
    async subscribe() {},
    async health(): Promise<HealthCheckResult> {
      return { status: 'ok' };
    },
    async close() {},
    raw() {
      return {
        sadd: async (key: string, member: string) => {
          sadds.push({ key, member });
          return 1;
        },
        smembers: async () => [],
        lpush: async (key: string, value: string) => {
          lpushes.push({ key, value });
          return 1;
        },
        ltrim: async (key: string, start: number, stop: number) => {
          ltrims.push({ key, start, stop });
          return 'OK';
        },
        lrange: async () => [],
      } as never;
    },
  } as MockRedis;
}

// ============================================================
// Mock MQTT Subscriber
// ============================================================

export type MqttMessageHandler = (payload: Buffer) => void;

export interface MockMqttSubscriber {
  connect(): Promise<void>;
  subscribe(topic: string, handler: MqttMessageHandler): Promise<void>;
  health(): Promise<HealthCheckResult>;
  close(): Promise<void>;
  getHandler(): MqttMessageHandler | null;
  getSubscribedTopic(): string | null;
}

export function createMockMqttSubscriber(): MockMqttSubscriber {
  let handler: MqttMessageHandler | null = null;
  let topic: string | null = null;

  return {
    async connect() {},
    async subscribe(t: string, h: MqttMessageHandler) {
      topic = t;
      handler = h;
    },
    async health(): Promise<HealthCheckResult> {
      return { status: 'ok' };
    },
    async close() {},
    getHandler: () => handler,
    getSubscribedTopic: () => topic,
  };
}

// ============================================================
// Mock MQTT Publisher
// ============================================================

export interface MockMqttPublishCall {
  topic: string;
  payload: unknown;
}

export interface MockMqttPublisher {
  connect(): Promise<void>;
  publish(topic: string, payload: unknown): Promise<void>;
  health(): Promise<HealthCheckResult>;
  close(): Promise<void>;
  readonly calls: MockMqttPublishCall[];
  reset(): void;
}

export function createMockMqttPublisher(): MockMqttPublisher {
  const calls: MockMqttPublishCall[] = [];

  return {
    calls,

    reset() {
      calls.length = 0;
    },

    async connect() {},
    async publish(topic: string, payload: unknown) {
      calls.push({ topic, payload });
    },
    async health(): Promise<HealthCheckResult> {
      return { status: 'ok' };
    },
    async close() {},
  };
}

// ============================================================
// 遥测构造
// ============================================================

export interface TelemetryOverrides {
  lat?: number;
  lng?: number;
  speed?: number;
  battery?: number;
  heading?: number;
  status?: 'idle' | 'running' | 'charging' | 'maintenance' | 'offline';
  ts?: number;
}

export function makeTelemetry(vehicleId: string, overrides: TelemetryOverrides = {}) {
  return {
    vehicle_id: vehicleId,
    ts: overrides.ts ?? Date.now(),
    lat: overrides.lat ?? 31.2304,
    lng: overrides.lng ?? 121.4737,
    speed: overrides.speed ?? 30,
    battery: overrides.battery ?? 80,
    heading: overrides.heading ?? 90,
    status: overrides.status ?? 'running',
  };
}
