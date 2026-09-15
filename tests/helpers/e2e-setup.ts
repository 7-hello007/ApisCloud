import { loadConfig, resetConfig } from '@apiscloud/libs';
import { createDataWriterService, type DataWriterService } from '@apiscloud/data-writer';
import { createIngestService, type IngestService } from '@apiscloud/ingest';
import { MemoryAdapter } from '@apiscloud/message-bus';

import {
  createMockMqttPublisher,
  createMockMqttSubscriber,
  createMockPg,
  createMockRedis,
  type MockMqttPublisher,
  type MockMqttSubscriber,
  type MockPg,
  type MockRedis,
} from './e2e-infra';

/**
 * e2e 测试环境。
 * 共享一个 MemoryAdapter，让 ingest 和 data-writer 在同一进程内互通。
 */
export interface E2eEnv {
  bus: MemoryAdapter;
  ingest: IngestService;
  dataWriter: DataWriterService;
  mockMqttSubscriber: MockMqttSubscriber;
  mockMqttPublisher: MockMqttPublisher;
  mockPg: MockPg;
  mockRedis: MockRedis;
}

export async function createE2eEnv(): Promise<E2eEnv> {
  resetConfig();

  const bus = new MemoryAdapter();
  const mockMqttSubscriber = createMockMqttSubscriber();
  const mockMqttPublisher = createMockMqttPublisher();
  const mockPg = createMockPg();
  const mockRedis = createMockRedis();

  const ingest = createIngestService({
    config: loadConfig({ SERVICE_NAME: 'ingest' }),
    port: 0,
    mqttSubscriber: mockMqttSubscriber,
    mqttPublisher: mockMqttPublisher,
    bus,
  });

  const dataWriter = createDataWriterService({
    config: loadConfig({ SERVICE_NAME: 'data-writer' }),
    port: 0,
    pg: mockPg,
    redis: mockRedis,
    bus,
  });

  await ingest.start();
  await dataWriter.start();

  return {
    bus,
    ingest,
    dataWriter,
    mockMqttSubscriber,
    mockMqttPublisher,
    mockPg,
    mockRedis,
  };
}

export async function destroyE2eEnv(env: E2eEnv): Promise<void> {
  await env.ingest.stop();
  await env.dataWriter.stop();
  await env.bus.close();
}

/**
 * 通过 mock MQTT subscriber 触发上行遥测。
 * 模拟 simulator 发 MQTT 消息。
 */
export function pushTelemetry(
  env: E2eEnv,
  payload: ReturnType<typeof import('./e2e-infra').makeTelemetry>,
): void {
  const handler = env.mockMqttSubscriber.getHandler();
  if (!handler) {
    throw new Error('MQTT subscriber 未订阅');
  }
  handler(Buffer.from(JSON.stringify(payload)));
}
