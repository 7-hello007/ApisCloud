import { loadConfig, type HealthCheckResult } from '@apiscloud/libs';
import {
  createIngestService,
  type IngestService,
  type MqttPublisher,
  type MqttSubscriber,
} from '@apiscloud/ingest';
import type {
  Envelope,
  MessageBus,
  MessageHandler,
  PublishOptions,
  Subscription,
  SubscribeOptions,
} from '@apiscloud/message-bus';
import { TOPICS } from '@apiscloud/message-bus';

import { waitFor } from './helpers';

interface MockMqttSubscriber extends MqttSubscriber {
  getHandler(): ((payload: Buffer) => void) | null;
  getSubscribedTopic(): string | null;
}

function createMockMqttSubscriber(): MockMqttSubscriber {
  let handler: ((payload: Buffer) => void) | null = null;
  let topic: string | null = null;
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(async (t: string, h: (payload: Buffer) => void) => {
      topic = t;
      handler = h;
    }),
    health: jest.fn().mockResolvedValue({ status: 'ok' as HealthCheckResult['status'] }),
    close: jest.fn().mockResolvedValue(undefined),
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
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn(async (topic: string, payload: unknown) => {
      calls.push({ topic, payload });
    }),
    health: jest.fn().mockResolvedValue({ status: 'ok' as HealthCheckResult['status'] }),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

interface MockBus extends MessageBus {
  readonly publishes: Array<{ topic: string; env: Envelope; options?: PublishOptions }>;
}

function createMockBus(): MockBus {
  const publishes: Array<{ topic: string; env: Envelope; options?: PublishOptions }> = [];
  return {
    type: 'memory',
    publishes,
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn(async (topic: string, env: Envelope, options?: PublishOptions) => {
      publishes.push({ topic, env, options });
    }),
    subscribe: jest.fn(
      async (
        _topic: string,
        _handler: MessageHandler,
        _options?: SubscribeOptions,
      ): Promise<Subscription> => {
        return {
          topic: _topic,
          async unsubscribe() {},
        };
      },
    ),
    commit: jest.fn().mockResolvedValue(undefined),
    health: jest.fn().mockResolvedValue({ status: 'ok' as HealthCheckResult['status'] }),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ingest.mqttToBus', () => {
  let service: IngestService;
  let mockSubscriber: MockMqttSubscriber;
  let mockPublisher: MockMqttPublisher;
  let mockBus: MockBus;

  beforeEach(async () => {
    mockSubscriber = createMockMqttSubscriber();
    mockPublisher = createMockMqttPublisher();
    mockBus = createMockBus();
    service = createIngestService({
      config: loadConfig(),
      port: 0,
      mqttSubscriber: mockSubscriber,
      mqttPublisher: mockPublisher,
      bus: mockBus,
    });
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('订阅 MQTT 上行 topic', () => {
    expect(mockSubscriber.getSubscribedTopic()).toBe('telemetry/raw');
  });

  it('合法遥测 → 发布到总线 telemetry.raw', async () => {
    const payload = Buffer.from(
      JSON.stringify({
        vehicle_id: 'v-000001',
        ts: Date.now(),
        lat: 31.23,
        lng: 121.47,
        speed: 30,
        battery: 80,
        heading: 90,
        status: 'running',
      }),
    );

    const handler = mockSubscriber.getHandler();
    expect(handler).not.toBeNull();
    handler!(payload);

    await waitFor(() => mockBus.publishes.length > 0);

    expect(mockBus.publishes).toHaveLength(1);
    const { topic, env, options } = mockBus.publishes[0];
    expect(topic).toBe(TOPICS.TELEMETRY_RAW);
    expect(env.source).toBe('ingest');
    expect((env.payload as { vehicle_id: string }).vehicle_id).toBe('v-000001');
    expect(options?.partitionKey).toBe('v-000001');
  });

  it('非法遥测不发布到总线', async () => {
    const payload = Buffer.from(
      JSON.stringify({
        vehicle_id: 'v-000001',
        ts: -1,
        lat: 31.23,
        lng: 121.47,
        speed: 30,
        battery: 80,
        heading: 90,
        status: 'running',
      }),
    );

    const handler = mockSubscriber.getHandler();
    handler!(payload);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockBus.publishes).toHaveLength(0);
  });

  it('非 JSON payload 不崩溃', async () => {
    const handler = mockSubscriber.getHandler();
    handler!(Buffer.from('not json'));

    await new Promise((r) => setTimeout(r, 50));
    expect(mockBus.publishes).toHaveLength(0);
  });

  it('多条遥测按顺序发布', async () => {
    const handler = mockSubscriber.getHandler();

    for (let i = 0; i < 3; i++) {
      const payload = Buffer.from(
        JSON.stringify({
          vehicle_id: `v-${String(i + 1).padStart(6, '0')}`,
          ts: Date.now(),
          lat: 31.23,
          lng: 121.47,
          speed: 30,
          battery: 80,
          heading: 90,
          status: 'running',
        }),
      );
      handler!(payload);
    }

    await waitFor(() => mockBus.publishes.length === 3);
    expect(
      mockBus.publishes.map((p) => (p.env.payload as { vehicle_id: string }).vehicle_id),
    ).toEqual(['v-000001', 'v-000002', 'v-000003']);
  });
});
