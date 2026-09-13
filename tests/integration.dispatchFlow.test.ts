import path from 'node:path';

import {
  createCommandSignature,
  loadConfig,
  type HealthCheckResult,
  type PgClient,
  type RedisWrapper,
} from '@apiscloud/libs';
import {
  createDataWriterService,
  type DataWriterService,
} from '@apiscloud/data-writer';
import {
  createDispatchCoreService,
  type DispatchCoreService,
  type DispatchTask,
} from '@apiscloud/dispatch-core';
import {
  createIngestService,
  type IngestService,
  type MqttMessageHandler,
  type MqttPublisher,
  type MqttSubscriber,
} from '@apiscloud/ingest';
import { createEnvelope, MemoryAdapter, TOPICS } from '@apiscloud/message-bus';

import { waitFor } from './helpers';

// ============================================================
// Mock MQTT Subscriber
// ============================================================

interface MockMqttSubscriber extends MqttSubscriber {
  getHandler(): MqttMessageHandler | null;
  getSubscribedTopic(): string | null;
}

function createMockMqttSubscriber(): MockMqttSubscriber {
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
  readonly sadds: Array<{ key: string; member: string }>;
}

function createMockRedis(): MockRedis {
  const sets: Array<{ key: string; value: string; ttl?: number }> = [];
  const sadds: Array<{ key: string; member: string }> = [];

  return {
    sets,
    sadds,
    async get() {
      return null;
    },
    async set(key, value, ttl) {
      sets.push({ key, value, ttl });
    },
    async del() {},
    async hset() {},
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
        lpush: async () => 1,
        ltrim: async () => 'OK',
      } as never;
    },
  } as MockRedis;
}

// ============================================================
// 测试主体
// ============================================================

const PLUGINS_DIR = path.resolve(__dirname, '..', 'plugins', 'dispatch');

describe('integration.dispatchFlow', () => {
  let bus: MemoryAdapter;
  let dispatch: DispatchCoreService;
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

    dispatch = createDispatchCoreService({
      config: loadConfig({ SERVICE_NAME: 'dispatch-core' }),
      port: 0,
      bus,
      algorithmPluginsDir: PLUGINS_DIR,
    });

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

    await dispatch.start();
    await ingest.start();
    await dataWriter.start();
  });

  afterEach(async () => {
    await dispatch.stop();
    await ingest.stop();
    await dataWriter.stop();
  });

  // ============================================================
  // 辅助
  // ============================================================

  function makeTelemetry(
    vehicleId: string,
    overrides: Partial<{
      lat: number;
      lng: number;
      speed: number;
      battery: number;
      status: string;
    }> = {},
  ) {
    return {
      vehicle_id: vehicleId,
      ts: Date.now(),
      lat: overrides.lat ?? 31.231,
      lng: overrides.lng ?? 121.474,
      speed: overrides.speed ?? 30,
      battery: overrides.battery ?? 80,
      heading: 90,
      status: overrides.status ?? 'idle',
    };
  }

  async function publishTelemetry(
    vehicleId: string,
    overrides?: Parameters<typeof makeTelemetry>[1],
  ): Promise<void> {
    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'simulator',
      payload: makeTelemetry(vehicleId, overrides),
    });
    await bus.publish(TOPICS.TELEMETRY_RAW, env, { partitionKey: vehicleId });
  }

  function makeTask(overrides: Partial<DispatchTask> = {}): DispatchTask {
    return {
      task_id: 'task-1',
      task_type: 'passenger',
      origin: { lat: 31.231, lng: 121.474 },
      priority: 50,
      ...overrides,
    };
  }

  // ============================================================
  // 用例
  // ============================================================

  it('dispatch-core 启动时从插件目录加载三个算法', () => {
    const names = dispatch.registry.names();
    expect(names).toContain('nearest');
    expect(names).toContain('batch-match');
    expect(names).toContain('priority-dispatch');
  });

  it('ingest 订阅了总线 events.commands', () => {
    // ingest 内部订阅总线，通过 mock 无法直接看总线订阅；用行为验证：
    // 手动发一条 events.commands，ingest 应转成 MQTT
    // 该用例略，交给后面的端到端用例覆盖
    expect(mqttSubscriber.getSubscribedTopic()).toBe('telemetry/raw');
  });

  it('遥测累积到 dispatch-core 的车辆注册表', async () => {
    await publishTelemetry('v-000001');
    await publishTelemetry('v-000002');
    await publishTelemetry('v-000003');

    await waitFor(() => dispatch.vehicles.size === 3);
    expect(dispatch.vehicles.size).toBe(3);
  });

  it('单任务端到端：遥测 → dispatch-core → events.commands → ingest → MQTT', async () => {
    await publishTelemetry('v-000001');
    await publishTelemetry('v-000002');
    await waitFor(() => dispatch.vehicles.size === 2);

    await dispatch.submitTask(makeTask());

    await waitFor(() => mqttPublisher.calls.length >= 1);

    expect(mqttPublisher.calls).toHaveLength(1);
    const call = mqttPublisher.calls[0];
    expect(call.topic).toMatch(/^commands\/v-\d{6}$/);

    const cmd = call.payload as {
      vehicle_id: string;
      command_id: string;
      command_type: string;
      payload: {
        task_id: string;
        issued_at: number;
        signed: { signature: string; algorithm: string };
      };
    };
    expect(cmd.command_type).toBe('dispatch');
    expect(cmd.payload.task_id).toBe('task-1');
    expect(cmd.payload.signed.signature).toBeTruthy();
    expect(cmd.payload.signed.algorithm).toBe('sha256');
  });

  it('命令签名可被 verify 通过', async () => {
    await publishTelemetry('v-000001');
    await waitFor(() => dispatch.vehicles.size === 1);

    await dispatch.submitTask(makeTask());
    await waitFor(() => mqttPublisher.calls.length >= 1);

    const cmd = mqttPublisher.calls[0].payload as {
      payload: {
        signed: {
          command: {
            command_id: string;
            vehicle_id: string;
            task_id: string;
            command_type: string;
            payload: unknown;
            issued_at: number;
          };
          signature: string;
          algorithm: string;
        };
      };
    };

    const verifyCtx = createCommandSignature({
      secret: process.env.DISPATCH_SIGN_SECRET ?? 'change-me-command-sign-secret',
    });

    const result = verifyCtx.verify({
      command: cmd.payload.signed.command,
      signature: cmd.payload.signed.signature,
      algorithm: cmd.payload.signed.algorithm,
    });

    expect(result.ok).toBe(true);
  });

  it('无候选车辆时不发命令', async () => {
    // 一辆在跑，一辆电量低，都不满足硬约束
    await publishTelemetry('v-000001', { status: 'running' });
    await publishTelemetry('v-000002', { battery: 10 });
    await waitFor(() => dispatch.vehicles.size === 2);

    await dispatch.submitTask(makeTask());

    // 等一段时间确认没有命令
    await new Promise((r) => setTimeout(r, 200));
    expect(mqttPublisher.calls).toHaveLength(0);
  });

  it('硬约束过滤：只挑 idle 且电量足够的车', async () => {
    await publishTelemetry('v-low-battery', { battery: 10, lat: 31.231, lng: 121.474 });
    await publishTelemetry('v-running', { status: 'running', lat: 31.231, lng: 121.474 });
    await publishTelemetry('v-good', { battery: 80, lat: 31.232, lng: 121.475 });
    await waitFor(() => dispatch.vehicles.size === 3);

    await dispatch.submitTask(makeTask());
    await waitFor(() => mqttPublisher.calls.length >= 1);

    const cmd = mqttPublisher.calls[0].payload as { vehicle_id: string };
    expect(cmd.vehicle_id).toBe('v-good');
  });

  it('nearest 算法挑选距离最近的车', async () => {
    await publishTelemetry('v-far', { lat: 31.4, lng: 121.7 });
    await publishTelemetry('v-near', { lat: 31.231, lng: 121.474 });
    await waitFor(() => dispatch.vehicles.size === 2);

    await dispatch.submitTask(makeTask({ origin: { lat: 31.2304, lng: 121.4737 } }));
    await waitFor(() => mqttPublisher.calls.length >= 1);

    const cmd = mqttPublisher.calls[0].payload as { vehicle_id: string };
    expect(cmd.vehicle_id).toBe('v-near');
  });

  it('data-writer 写 dispatch_commands 审计表', async () => {
    await publishTelemetry('v-000001');
    await waitFor(() => dispatch.vehicles.size === 1);

    await dispatch.submitTask(makeTask());

    await waitFor(() =>
      mockPg.queries.some((q) => q.sql.includes('INSERT INTO dispatch_commands')),
    );

    const insert = mockPg.queries.find((q) => q.sql.includes('dispatch_commands'));
    expect(insert).toBeDefined();
    expect(insert!.params).toBeDefined();
    expect(insert!.params![0]).toBeTruthy(); // command_id
    expect(insert!.params![1]).toBe('v-000001');
    expect(insert!.params![2]).toBe('task-1');
    expect(insert!.params![3]).toBe('dispatch');
  });

  it('多个任务串行，每个都有独立 command_id', async () => {
    await publishTelemetry('v-000001');
    await waitFor(() => dispatch.vehicles.size === 1);

    await dispatch.submitTask(makeTask({ task_id: 'task-1' }));
    await dispatch.submitTask(makeTask({ task_id: 'task-2' }));
    await dispatch.submitTask(makeTask({ task_id: 'task-3' }));

    await waitFor(() => mqttPublisher.calls.length === 3);

    const commandIds = mqttPublisher.calls.map(
      (c) => (c.payload as { command_id: string }).command_id,
    );
    const uniqueIds = new Set(commandIds);
    expect(uniqueIds.size).toBe(3);
  });
});
