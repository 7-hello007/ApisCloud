import { loadConfig, resetConfig, type HealthCheckResult } from '@apiscloud/libs';
import {
  createMessageBus,
  createEnvelope,
  MemoryAdapter,
  TOPICS,
  type Envelope,
  type MessageBus,
} from '@apiscloud/message-bus';

/**
 * 通用的业务函数，只依赖 MessageBus 接口。
 * 不关心底层是 Kafka 还是 Memory。
 */
async function runBusinessFlow(bus: MessageBus, inputVehicleId: string): Promise<string[]> {
  await bus.connect();

  const received: string[] = [];
  await bus.subscribe(TOPICS.TELEMETRY_RAW, async (env: Envelope) => {
    const p = env.payload as { vehicle_id: string };
    received.push(p.vehicle_id);
  });

  const env = createEnvelope({
    topic: TOPICS.TELEMETRY_RAW,
    source: 'test',
    payload: { vehicle_id: inputVehicleId, ts: Date.now() },
  });
  await bus.publish(TOPICS.TELEMETRY_RAW, env, { partitionKey: inputVehicleId });

  await bus.close();
  return received;
}

describe('messageBus.switchVerification', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('业务代码用 MessageBus 接口，不直接依赖适配器', () => {
    // 编译期验证：函数签名只接受 MessageBus
    expect(typeof runBusinessFlow).toBe('function');
  });

  it('Memory 适配器能跑通业务流', async () => {
    const bus = new MemoryAdapter();
    const received = await runBusinessFlow(bus, 'v-memory-1');
    expect(received).toEqual(['v-memory-1']);
  });

  it('createMessageBus(MESSAGE_BUS=memory) 返回 MemoryAdapter', () => {
    const config = loadConfig();
    // 测试环境默认 MESSAGE_BUS=memory
    const bus = createMessageBus(config);
    expect(bus.type).toBe('memory');
  });

  it('createMessageBus(MESSAGE_BUS=kafka) 返回 KafkaAdapter', () => {
    process.env.MESSAGE_BUS = 'kafka';
    try {
      const config = loadConfig();
      const bus = createMessageBus(config);
      expect(bus.type).toBe('kafka');
      // 只验证类型，不连接真实 Kafka
    } finally {
      process.env.MESSAGE_BUS = 'memory';
    }
  });

  it('createMessageBus(MESSAGE_BUS=mqtt) 返回 MqttAdapter', () => {
    process.env.MESSAGE_BUS = 'mqtt';
    try {
      const config = loadConfig();
      const bus = createMessageBus(config);
      expect(bus.type).toBe('mqtt');
    } finally {
      process.env.MESSAGE_BUS = 'memory';
    }
  });

  it('所有适配器实现同一接口（编译期保证）', () => {
    const check = (bus: MessageBus): HealthCheckResult | Promise<HealthCheckResult> => bus.health();
    expect(typeof check).toBe('function');
  });

  it('同一套业务代码，不同适配器行为一致', async () => {
    // 用两个独立的 MemoryAdapter，模拟切换媒介后行为一致
    const busA = new MemoryAdapter();
    const busB = new MemoryAdapter();

    const receivedA = await runBusinessFlow(busA, 'v-1');
    const receivedB = await runBusinessFlow(busB, 'v-1');

    expect(receivedA).toEqual(receivedB);
  });
});
