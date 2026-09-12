import { loadConfig, type HealthCheckResult } from '@apiscloud/libs';
import {
  createIngestService,
  type IngestService,
  type MqttPublisher,
  type MqttSubscriber,
} from '@apiscloud/ingest';
import {
  createEnvelope,
  TOPICS,
  type Envelope,
  type MessageBus,
  type MessageHandler,
  type PublishOptions,
  type Subscription,
  type SubscribeOptions,
} from '@apiscloud/message-bus';

import { waitFor } from './helpers';

function createMockMqttSubscriber(): MqttSubscriber {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    health: jest.fn().mockResolvedValue({ status: 'ok' as HealthCheckResult['status'] }),
    close: jest.fn().mockResolvedValue(undefined),
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
  getCommandHandler(): MessageHandler | null;
  getSubscribedTopic(): string | null;
  getGroupId(): string | null;
}

function createMockBus(): MockBus {
  let handler: MessageHandler | null = null;
  let topic: string | null = null;
  let groupId: string | null = null;
  return {
    type: 'memory',
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn(async (_topic: string, _env: Envelope, _opts?: PublishOptions) => {}),
    subscribe: jest.fn(
      async (t: string, h: MessageHandler, options?: SubscribeOptions): Promise<Subscription> => {
        topic = t;
        handler = h;
        groupId = options?.groupId ?? null;
        return {
          topic: t,
          async unsubscribe() {},
        };
      },
    ),
    commit: jest.fn().mockResolvedValue(undefined),
    health: jest.fn().mockResolvedValue({ status: 'ok' as HealthCheckResult['status'] }),
    close: jest.fn().mockResolvedValue(undefined),
    getCommandHandler: () => handler,
    getSubscribedTopic: () => topic,
    getGroupId: () => groupId,
  };
}

describe('ingest.busToMqtt', () => {
  let service: IngestService;
  let mockSubscriber: MqttSubscriber;
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

  it('订阅总线 events.commands', () => {
    expect(mockBus.getSubscribedTopic()).toBe(TOPICS.EVENTS_COMMANDS);
  });

  it('使用配置的消费组', () => {
    expect(mockBus.getGroupId()).toBe('apiscloud-ingest');
  });

  it('合法命令 → 发布到 MQTT commands/{vehicle_id}', async () => {
    const env = createEnvelope({
      topic: TOPICS.EVENTS_COMMANDS,
      source: 'dispatch-core',
      payload: {
        vehicle_id: 'v-000001',
        command_id: 'cmd-1',
        command_type: 'dispatch',
        payload: { lat: 31.2, lng: 121.4 },
      },
    });

    const handler = mockBus.getCommandHandler();
    expect(handler).not.toBeNull();
    await handler!(env);

    await waitFor(() => mockPublisher.calls.length > 0);

    expect(mockPublisher.calls).toHaveLength(1);
    const call = mockPublisher.calls[0];
    expect(call.topic).toBe('commands/v-000001');
    expect((call.payload as { command_id: string }).command_id).toBe('cmd-1');
  });

  it('非法命令不发布到 MQTT', async () => {
    const env = createEnvelope({
      topic: TOPICS.EVENTS_COMMANDS,
      source: 'dispatch-core',
      payload: {
        vehicle_id: '',
        command_id: 'cmd-1',
        command_type: 'dispatch',
        payload: {},
      },
    });

    const handler = mockBus.getCommandHandler();
    await handler!(env);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockPublisher.calls).toHaveLength(0);
  });

  it('多条命令按顺序发布', async () => {
    const handler = mockBus.getCommandHandler();

    for (let i = 0; i < 3; i++) {
      const env = createEnvelope({
        topic: TOPICS.EVENTS_COMMANDS,
        source: 'dispatch-core',
        payload: {
          vehicle_id: `v-${String(i + 1).padStart(6, '0')}`,
          command_id: `cmd-${i + 1}`,
          command_type: 'dispatch',
          payload: {},
        },
      });
      await handler!(env);
    }

    await waitFor(() => mockPublisher.calls.length === 3);
    expect(mockPublisher.calls.map((c) => c.topic)).toEqual([
      'commands/v-000001',
      'commands/v-000002',
      'commands/v-000003',
    ]);
  });
});
