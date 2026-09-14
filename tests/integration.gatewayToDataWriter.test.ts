/* eslint-disable @typescript-eslint/no-require-imports */
import path from 'node:path';

import { loadConfig, resetConfig } from '@apiscloud/libs';
import {
  createDataWriterService,
  type DataWriterService,
} from '@apiscloud/data-writer';
import { createGatewayService, type GatewayService } from '@apiscloud/gateway';
import { createIngestService, type IngestService } from '@apiscloud/ingest';
import { MemoryAdapter, TOPICS, createEnvelope } from '@apiscloud/message-bus';

import {
  createMockMqttPublisher,
  createMockMqttSubscriber,
  createMockPg,
  createMockRedis,
  makeTelemetry,
  type MockMqttPublisher,
  type MockMqttSubscriber,
  type MockPg,
  type MockRedis,
} from './helpers/e2e-infra';
import { waitFor } from './helpers';

const PLUGINS_DIR = path.resolve(__dirname, '..', 'plugins');

/**
 * 集成测试：ingest → 总线 → data-writer → gateway 反向代理查回。
 */
describe('integration.gatewayToDataWriter', () => {
  let bus: MemoryAdapter;
  let ingest: IngestService;
  let dataWriter: DataWriterService;
  let gateway: GatewayService;
  let mockMqttSubscriber: MockMqttSubscriber;
  let mockMqttPublisher: MockMqttPublisher;
  let mockPg: MockPg;
  let mockRedis: MockRedis;

  beforeEach(async () => {
    resetConfig();
    bus = new MemoryAdapter();
    mockMqttSubscriber = createMockMqttSubscriber();
    mockMqttPublisher = createMockMqttPublisher();
    mockPg = createMockPg();
    mockRedis = createMockRedis();

    process.env.GATEWAY_PLUGIN_DIRS = PLUGINS_DIR;

    ingest = createIngestService({
      config: loadConfig({ SERVICE_NAME: 'ingest' }),
      port: 0,
      mqttSubscriber: mockMqttSubscriber,
      mqttPublisher: mockMqttPublisher,
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

    gateway = createGatewayService({
      config: loadConfig({ SERVICE_NAME: 'gateway' }),
      port: 0,
      bus,
      proxiedServices: [
        {
          name: 'data-writer',
          target: `http://localhost:${dataWriter.port()}`,
        },
      ],
    });
    await gateway.start();
  });

  afterEach(async () => {
    await gateway.stop();
    await dataWriter.stop();
    await ingest.stop();
    await bus.close();
    delete process.env.GATEWAY_PLUGIN_DIRS;
  });

  it('遥测写入 → data-writer 收到 → 通过 gateway 代理查回', async () => {
    // 用 setQueryOverride，仍会推入 queries 数组
    mockPg.setQueryOverride(async (sql: string, params?: unknown[]) => {
      if (sql.includes('vehicle_latest')) {
        return {
          rows: (params as string[]).map((id) => ({
            vehicle_id: id,
            status: 'running',
            battery: 80,
            lat: 31.2304,
            lng: 121.4737,
            heading: 90,
            speed: 30,
            updated_at: new Date().toISOString(),
          })),
          rowCount: params?.length ?? 0,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    // 让 mock Redis 返回一组活跃车辆
    const originalRaw = mockRedis.raw.bind(mockRedis);
    (mockRedis as unknown as { raw: () => unknown }).raw = () => ({
      ...(originalRaw() as object),
      smembers: async () => ['v-000001', 'v-000002', 'v-000003'],
    });

    // 1. 触发 3 条遥测
    const handler = mockMqttSubscriber.getHandler();
    expect(handler).not.toBeNull();

    for (const id of ['v-000001', 'v-000002', 'v-000003']) {
      handler!(Buffer.from(JSON.stringify(makeTelemetry(id))));
    }

    // 2. 等 data-writer 消费
    await waitFor(
      () => mockPg.queriesBySql('vehicle_latest').length >= 3,
      { timeoutMs: 5000 },
    );

    // 3. 通过 gateway 代理查回
    const res = await fetch(
      `http://localhost:${gateway.port()}/api/proxy/data-writer/api/query/vehicles/active`,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      count: number;
      vehicles: Array<{ vehicle_id: string; status: string; battery: number }>;
    };
    expect(body.count).toBe(3);
    expect(body.vehicles.map((v) => v.vehicle_id).sort()).toEqual([
      'v-000001',
      'v-000002',
      'v-000003',
    ]);
  });

  it('命令下发：dispatch 消息经 ingest → MQTT', async () => {
    const env = createEnvelope({
      topic: TOPICS.EVENTS_COMMANDS,
      source: 'test',
      payload: {
        vehicle_id: 'v-000001',
        command_id: 'cmd-1',
        command_type: 'dispatch',
        payload: { task_id: 'task-1' },
      },
    });

    await bus.publish(TOPICS.EVENTS_COMMANDS, env, { partitionKey: 'v-000001' });

    await waitFor(() => mockMqttPublisher.calls.length >= 1);

    const call = mockMqttPublisher.calls[0];
    expect(call.topic).toBe('commands/v-000001');
    const cmd = call.payload as { command_id: string; command_type: string };
    expect(cmd.command_id).toBe('cmd-1');
    expect(cmd.command_type).toBe('dispatch');
  });

  it('gateway 健康检查包含 plugin-host', async () => {
    const res = await fetch(`http://localhost:${gateway.port()}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      checks: Record<string, { status: string }>;
    };
    expect(body.checks['plugin-host']).toBeDefined();
    expect(body.checks['plugin-host'].status).toBe('ok');
  });

  it('代理未知服务返回 404', async () => {
    const res = await fetch(
      `http://localhost:${gateway.port()}/api/proxy/unknown-svc/health`,
    );
    expect(res.status).toBe(404);
  });

  it('代理 data-writer 的 health 端点', async () => {
    const res = await fetch(
      `http://localhost:${gateway.port()}/api/proxy/data-writer/health`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { service: string; status: string };
    expect(body.service).toBe('data-writer');
    expect(body.status).toBe('ok');
  });
});
