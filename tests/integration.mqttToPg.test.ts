import {
  loadConfig,
  type HealthCheckResult,
  type PgClient,
  type RedisWrapper,
} from '@apiscloud/libs';
import {
  createIngestService,
  type IngestService,
  type MqttMessageHandler,
  type MqttPublisher,
  type MqttSubscriber,
} from '@apiscloud/ingest';
import {
  createDataWriterService,
  type DataWriterService,
} from '@apiscloud/data-writer';
import { MemoryAdapter, TOPICS } from '@apiscloud/message-bus';

import { waitFor } from './helpers';

// ============================================================
// Mock MQTT
// ============================================================

interface MockMqttSubscriber extends MqttSubscriber {
  getHandler(): MqttMessageHandler | null;
  getSubscribedTopic(): string | null;
  readonly subscribeCalls: number;
}

function createMockMqttSubscriber(): MockMqttSubscriber {
  let handler: MqttMessageHandler | null = null;
  let topic: string | null = null;
  let subscribeCalls = 0;
  return {
    get subscribeCalls() {
      return subscribeCalls;
    },
    async connect() {},
    async subscribe(t: string, h: MqttMessageHandler) {
      topic = t;
      handler = h;
      subscribeCalls += 1;
    },
    async health(): Promise<HealthCheckResult> {
      return { status: 'ok' };
    },
    async close() {},
    getHandler: () => handler,
    getSubscribedTopic: () => topic,
  };
}

interface MockMqttPublisher extends MqttPublisher {
  readonly calls: Array<{ topic: string; payload: unknown }>;
}

function createMockMqttPublisher(): MockMqttPublisher {
  const calls: Array<{ topic: string; payload: unknown }> = [];
  return {
    calls,
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
// Mock PG
// ============================================================

interface MockPg extends PgClient {
  readonly queries: Array<{ sql: string; params?: unknown[] }>;
}

function createMockPg(): MockPg {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  return {
    queries,
    async query(sql: string, params?: unknown[]) {
      queries.push({ sql, params });
      return { rows: [], rowCount: 0 } as never;
    },
    async transaction() {
      throw new Error('not implemented');
    },
    async health(): Promise<HealthCheckResult> {
      return { status: 'ok' };
    },
    async close() {},
    raw() {
      throw new Error('not implemented');
    },
  } as unknown as MockPg;
}

// ============================================================
// Mock Redis
// ============================================================

interface MockRedis extends RedisWrapper {
  readonly sets: Array<{ key: string; value: string; ttl?: number }>;
  readonly hsets: Array<{ key: string; field: string; value: string }>;
  readonly sadds: Array<{ key: string; member: string }>;
}

interface MockRedisClient {
  sadd(key: string, member: string): Promise<number>;
  lpush(key: string, value: string): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<'OK'>;
}

function createMockRedis(): MockRedis {
  const sets: Array<{ key: string; value: string; ttl?: number }> = [];
  const hsets: Array<{ key: string; field: string; value: string }> = [];
  const sadds: Array<{ key: string; member: string }> = [];

  const mockClient: MockRedisClient = {
    async sadd(key, member) {
      sadds.push({ key, member });
      return 1;
    },
    async lpush() {
      return 1;
    },
    async ltrim() {
      return 'OK';
    },
  };

  return {
    sets,
    hsets,
    sadds,
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
      return mockClient as never;
    },
  } as MockRedis;
}

// ============================================================
// 测试
// ============================================================

describe('integration.mqttToPg', () => {
  let bus: MemoryAdapter;
  let ingest: IngestService;
  let dataWriter: DataWriterService;
  let mqttSubscriber: MockMqttSubscriber;
  let mqttPublisher: MockMqttPublisher;
  let mockPg: MockPg;
  let mockRedis: MockRedis;

  beforeEach(async () => {
    bus = new MemoryAdapter();
    mqttSubscriber = createMockMqttSubscriber();
    mqttPublisher = createMockMqttPublisher();
    mockPg = createMockPg();
    mockRedis = createMockRedis();

    // 共享同一个总线实例
    ingest = createIngestService({
      config: loadConfig({ SERVICE_NAME: 'ingest' }),
      port: 0,
      mqttSubscriber,
      mqttPublisher,
      bus,
    });

    dataWriter = createDataWriterService({
      config: loadConfig({ SERVICE_NAME: 'data-writer' }),
      port: 0,
      pg: mockPg,
      redis: mockRedis,
      bus,
    });

    await ingest.start();
    await dataWriter.start();
  });

  afterEach(async () => {
    await ingest.stop();
    await dataWriter.stop();
  });

  function makeTelemetry(vehicleId: string, overrides: Record<string, unknown> = {}) {
    return {
      vehicle_id: vehicleId,
      ts: Date.now(),
      lat: 31.23,
      lng: 121.47,
      speed: 30,
      battery: 80,
      heading: 90,
      status: 'running',
      ...overrides,
    };
  }

  it('ingest 订阅了 MQTT 上行 topic', () => {
    expect(mqttSubscriber.getSubscribedTopic()).toBe('telemetry/raw');
  });

  it('单条遥测从 MQTT 流到 PG vehicle_latest 和 vehicle_telemetry', async () => {
    const handler = mqttSubscriber.getHandler();
    expect(handler).not.toBeNull();

    const telemetry = makeTelemetry('v-000001');
    handler!(Buffer.from(JSON.stringify(telemetry)));

    await waitFor(() => mockPg.queries.length >= 2);

    const sqls = mockPg.queries.map((q) => q.sql);
    expect(sqls.some((s) => s.includes('INSERT INTO vehicle_latest'))).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO vehicle_telemetry'))).toBe(true);
  });

  it('UPSERT vehicle_latest 的参数正确', async () => {
    const handler = mqttSubscriber.getHandler();
    handler!(Buffer.from(JSON.stringify(makeTelemetry('v-000042'))));

    await waitFor(() => mockPg.queries.length >= 2);

    const upsert = mockPg.queries.find((q) => q.sql.includes('vehicle_latest'));
    expect(upsert).toBeDefined();
    expect(upsert!.params).toEqual([
      'v-000042',
      'running',
      80,
      31.23,
      121.47,
      90,
      30,
    ]);
  });

  it('INSERT vehicle_telemetry 的参数含 ISO 时间戳', async () => {
    const handler = mqttSubscriber.getHandler();
    handler!(Buffer.from(JSON.stringify(makeTelemetry('v-000001'))));

    await waitFor(() => mockPg.queries.length >= 2);

    const insert = mockPg.queries.find((q) => q.sql.includes('vehicle_telemetry'));
    expect(insert).toBeDefined();
    expect(insert!.params).toHaveLength(8);
    expect(insert!.params![0]).toBe('v-000001');
    expect(typeof insert!.params![1]).toBe('string');
    expect(insert!.params![1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('遥测同时写 Redis 热路径', async () => {
    const handler = mqttSubscriber.getHandler();
    handler!(Buffer.from(JSON.stringify(makeTelemetry('v-000001'))));

    await waitFor(() => mockRedis.sets.length >= 1);

    const latestSet = mockRedis.sets.find((s) => s.key === 'vehicle:v-000001:latest');
    expect(latestSet).toBeDefined();
    expect(latestSet!.ttl).toBe(60);
    expect(JSON.parse(latestSet!.value)).toMatchObject({ vehicle_id: 'v-000001' });
  });

  it('遥测加到活跃车辆集合', async () => {
    const handler = mqttSubscriber.getHandler();
    handler!(Buffer.from(JSON.stringify(makeTelemetry('v-000001'))));

    await waitFor(() => mockRedis.sadds.length >= 1);

    expect(mockRedis.sadds).toEqual([
      { key: 'vehicles:active', member: 'v-000001' },
    ]);
  });

  it('合法遥测产生 1 条总线消息', async () => {
    const received: unknown[] = [];
    await bus.subscribe(TOPICS.TELEMETRY_RAW, async (env) => {
      received.push(env.payload);
    });

    const handler = mqttSubscriber.getHandler();
    handler!(Buffer.from(JSON.stringify(makeTelemetry('v-000001'))));

    await waitFor(() => received.length === 1);
    expect(received[0]).toMatchObject({ vehicle_id: 'v-000001' });
  });

  it('非法遥测不进入总线也不写 PG', async () => {
    const received: unknown[] = [];
    await bus.subscribe(TOPICS.TELEMETRY_RAW, async (env) => {
      received.push(env.payload);
    });

    const handler = mqttSubscriber.getHandler();
    handler!(Buffer.from(JSON.stringify({ vehicle_id: '', ts: -1 })));

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(0);
    expect(mockPg.queries).toHaveLength(0);
  });

  it('非 JSON payload 不进入总线也不写 PG', async () => {
    const received: unknown[] = [];
    await bus.subscribe(TOPICS.TELEMETRY_RAW, async (env) => {
      received.push(env.payload);
    });

    const handler = mqttSubscriber.getHandler();
    handler!(Buffer.from('not json at all'));

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(0);
    expect(mockPg.queries).toHaveLength(0);
  });

  it('多条遥测按顺序流到 PG', async () => {
    const handler = mqttSubscriber.getHandler();

    for (let i = 0; i < 3; i++) {
      handler!(Buffer.from(JSON.stringify(makeTelemetry(`v-${String(i + 1).padStart(6, '0')}`))));
    }

    await waitFor(() => mockPg.queries.length >= 6);

    const upserts = mockPg.queries.filter((q) => q.sql.includes('vehicle_latest'));
    expect(upserts.map((q) => q.params![0])).toEqual(['v-000001', 'v-000002', 'v-000003']);
  });

  it('100 条遥测全部到达 PG', async () => {
    const handler = mqttSubscriber.getHandler();

    for (let i = 0; i < 100; i++) {
      handler!(Buffer.from(JSON.stringify(makeTelemetry(`v-${String(i + 1).padStart(6, '0')}`))));
    }

    await waitFor(() => mockPg.queries.length >= 200);

    const upserts = mockPg.queries.filter((q) => q.sql.includes('vehicle_latest'));
    expect(upserts).toHaveLength(100);

    const distinct = new Set(upserts.map((q) => q.params![0]));
    expect(distinct.size).toBe(100);
  });

  it('下行命令：总线 events.commands 到 MQTT commands/{vehicle_id}', async () => {
    await bus.publish(
      TOPICS.EVENTS_COMMANDS,
      {
        id: 'env-1',
        topic: TOPICS.EVENTS_COMMANDS,
        source: 'dispatch-core',
        timestamp: Date.now(),
        trace_id: 't-1',
        span_id: 's-1',
        version: '1.0',
        payload: {
          vehicle_id: 'v-000001',
          command_id: 'cmd-1',
          command_type: 'dispatch',
          payload: { lat: 31.2, lng: 121.4 },
        },
      },
    );

    await waitFor(() => mqttPublisher.calls.length >= 1);

    expect(mqttPublisher.calls).toHaveLength(1);
    expect(mqttPublisher.calls[0].topic).toBe('commands/v-000001');
    expect((mqttPublisher.calls[0].payload as { command_id: string }).command_id).toBe('cmd-1');
  });

  it('全链路：500 条遥测流到 PG 和 Redis', async () => {
    const handler = mqttSubscriber.getHandler();

    for (let i = 0; i < 500; i++) {
      handler!(
        Buffer.from(JSON.stringify(makeTelemetry(`v-${String(i + 1).padStart(6, '0')}`))),
      );
    }

    await waitFor(() => mockPg.queries.length >= 1000, { timeoutMs: 10000 });

    const upserts = mockPg.queries.filter((q) => q.sql.includes('vehicle_latest'));
    const inserts = mockPg.queries.filter((q) => q.sql.includes('vehicle_telemetry'));
    expect(upserts).toHaveLength(500);
    expect(inserts).toHaveLength(500);

    expect(mockRedis.sets).toHaveLength(500);
    expect(mockRedis.sadds).toHaveLength(500);
    expect(new Set(mockRedis.sadds.map((s) => s.member)).size).toBe(500);
  });
});
