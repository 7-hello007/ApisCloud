import { createCommandSignature, loadConfig, type HealthCheckResult } from '@apiscloud/libs';
import {
  createIngestService,
  type IngestService,
  type MqttPublisher,
  type MqttSubscriber,
} from '@apiscloud/ingest';
import { createEnvelope, MemoryAdapter, TOPICS } from '@apiscloud/message-bus';

import { waitFor } from './helpers';

const SECRET = 'test-sign-secret';

function createMockMqttSubscriber(): MqttSubscriber {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    health: jest.fn().mockResolvedValue({ status: 'ok' as HealthCheckResult['status'] }),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

interface MockPublisher extends MqttPublisher {
  readonly calls: Array<{ topic: string; payload: unknown }>;
}

function createMockMqttPublisher(): MockPublisher {
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

describe('ingest.commandSignature', () => {
  let service: IngestService;
  let publisher: MockPublisher;
  let bus: MemoryAdapter;

  beforeEach(async () => {
    process.env.INGEST_VERIFY_SIGNATURE = 'true';
    process.env.DISPATCH_SIGN_SECRET = SECRET;

    bus = new MemoryAdapter();
    publisher = createMockMqttPublisher();

    service = createIngestService({
      config: loadConfig({ SERVICE_NAME: 'ingest' }),
      port: 0,
      mqttSubscriber: createMockMqttSubscriber(),
      mqttPublisher: publisher,
      bus,
    });
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
    await bus.close();
    delete process.env.INGEST_VERIFY_SIGNATURE;
    delete process.env.DISPATCH_SIGN_SECRET;
  });

  function makeSignedCommand(vehicleId: string) {
    const sig = createCommandSignature({ secret: SECRET });
    const command = {
      command_id: `cmd-${Date.now()}`,
      vehicle_id: vehicleId,
      task_id: 'task-1',
      command_type: 'dispatch',
      payload: { origin: { lat: 31.23, lng: 121.47 } },
      issued_at: Math.floor(Date.now() / 1000),
    };
    const signed = sig.sign(command);
    return {
      vehicle_id: vehicleId,
      command_id: command.command_id,
      command_type: 'dispatch',
      payload: {
        task_id: 'task-1',
        signed,
      },
    };
  }

  it('有效签名的命令能通过', async () => {
    const payload = makeSignedCommand('v-000001');
    const env = createEnvelope({
      topic: TOPICS.EVENTS_COMMANDS,
      source: 'dispatch-core',
      payload,
    });

    await bus.publish(TOPICS.EVENTS_COMMANDS, env, { partitionKey: 'v-000001' });

    await waitFor(() => publisher.calls.length >= 1);
    expect(publisher.calls).toHaveLength(1);
    expect(publisher.calls[0].topic).toBe('commands/v-000001');
  });

  it('无签名的命令被拒绝', async () => {
    const env = createEnvelope({
      topic: TOPICS.EVENTS_COMMANDS,
      source: 'dispatch-core',
      payload: {
        vehicle_id: 'v-000002',
        command_id: 'cmd-no-sig',
        command_type: 'dispatch',
        payload: { task_id: 'task-1' },
      },
    });

    await bus.publish(TOPICS.EVENTS_COMMANDS, env, { partitionKey: 'v-000002' });

    await new Promise((r) => setTimeout(r, 100));
    expect(publisher.calls).toHaveLength(0);
  });

  it('错误密钥签的命令被拒绝', async () => {
    const wrongSig = createCommandSignature({ secret: 'wrong-secret' });
    const command = {
      command_id: 'cmd-wrong-sig',
      vehicle_id: 'v-000003',
      command_type: 'dispatch',
      payload: {},
      issued_at: Math.floor(Date.now() / 1000),
    };
    const signed = wrongSig.sign(command);

    const env = createEnvelope({
      topic: TOPICS.EVENTS_COMMANDS,
      source: 'dispatch-core',
      payload: {
        vehicle_id: 'v-000003',
        command_id: command.command_id,
        command_type: 'dispatch',
        payload: { signed },
      },
    });

    await bus.publish(TOPICS.EVENTS_COMMANDS, env, { partitionKey: 'v-000003' });

    await new Promise((r) => setTimeout(r, 100));
    expect(publisher.calls).toHaveLength(0);
  });

  it('过期签名的命令被拒绝', async () => {
    const sig = createCommandSignature({ secret: SECRET, ttlSec: 1 });
    const command = {
      command_id: 'cmd-expired',
      vehicle_id: 'v-000004',
      command_type: 'dispatch',
      payload: {},
      issued_at: Math.floor(Date.now() / 1000) - 3600, // 1 小时前
    };
    const signed = sig.sign(command);

    const env = createEnvelope({
      topic: TOPICS.EVENTS_COMMANDS,
      source: 'dispatch-core',
      payload: {
        vehicle_id: 'v-000004',
        command_id: command.command_id,
        command_type: 'dispatch',
        payload: { signed },
      },
    });

    await bus.publish(TOPICS.EVENTS_COMMANDS, env, { partitionKey: 'v-000004' });

    await new Promise((r) => setTimeout(r, 100));
    expect(publisher.calls).toHaveLength(0);
  });

  it('签名验证关闭时，无签名命令也能通过', async () => {
    await service.stop();
    process.env.INGEST_VERIFY_SIGNATURE = 'false';

    bus = new MemoryAdapter();
    publisher = createMockMqttPublisher();
    service = createIngestService({
      config: loadConfig({ SERVICE_NAME: 'ingest' }),
      port: 0,
      mqttSubscriber: createMockMqttSubscriber(),
      mqttPublisher: publisher,
      bus,
    });
    await service.start();

    const env = createEnvelope({
      topic: TOPICS.EVENTS_COMMANDS,
      source: 'dispatch-core',
      payload: {
        vehicle_id: 'v-000005',
        command_id: 'cmd-any',
        command_type: 'dispatch',
        payload: {},
      },
    });

    await bus.publish(TOPICS.EVENTS_COMMANDS, env, { partitionKey: 'v-000005' });

    await waitFor(() => publisher.calls.length >= 1);
    expect(publisher.calls).toHaveLength(1);
  });
});
