import { createEnvelope } from '@apiscloud/message-bus';
import { MemoryAdapter } from '@apiscloud/message-bus';
import { TOPICS } from '@apiscloud/message-bus';

describe('messageBus.memory', () => {
  let bus: MemoryAdapter;

  beforeEach(async () => {
    bus = new MemoryAdapter();
    await bus.connect();
  });

  afterEach(async () => {
    await bus.close();
  });

  it('publish + subscribe 可收到消息', async () => {
    const received: unknown[] = [];
    await bus.subscribe(TOPICS.TELEMETRY_RAW, async (env) => {
      received.push(env.payload);
    });

    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'simulator',
      payload: { vehicle_id: 'v-1' },
    });
    await bus.publish(TOPICS.TELEMETRY_RAW, env);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ vehicle_id: 'v-1' });
  });

  it('多个订阅者都能收到', async () => {
    let countA = 0;
    let countB = 0;
    await bus.subscribe(TOPICS.TELEMETRY_RAW, async () => {
      countA++;
    });
    await bus.subscribe(TOPICS.TELEMETRY_RAW, async () => {
      countB++;
    });

    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'simulator',
      payload: {},
    });
    await bus.publish(TOPICS.TELEMETRY_RAW, env);

    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

  it('filter 可过滤消息', async () => {
    const received: string[] = [];
    await bus.subscribe(
      TOPICS.TELEMETRY_RAW,
      async (env) => {
        received.push(env.source);
      },
      {
        filter: (env) => env.source === 'simulator',
      },
    );

    await bus.publish(
      TOPICS.TELEMETRY_RAW,
      createEnvelope({ topic: TOPICS.TELEMETRY_RAW, source: 'simulator', payload: {} }),
    );
    await bus.publish(
      TOPICS.TELEMETRY_RAW,
      createEnvelope({ topic: TOPICS.TELEMETRY_RAW, source: 'other', payload: {} }),
    );

    expect(received).toEqual(['simulator']);
  });

  it('unsubscribe 后不再收到', async () => {
    let count = 0;
    const sub = await bus.subscribe(TOPICS.TELEMETRY_RAW, async () => {
      count++;
    });

    await bus.publish(
      TOPICS.TELEMETRY_RAW,
      createEnvelope({ topic: TOPICS.TELEMETRY_RAW, source: 'simulator', payload: {} }),
    );
    expect(count).toBe(1);

    await sub.unsubscribe();

    await bus.publish(
      TOPICS.TELEMETRY_RAW,
      createEnvelope({ topic: TOPICS.TELEMETRY_RAW, source: 'simulator', payload: {} }),
    );
    expect(count).toBe(1);
  });

  it('未连接 publish 抛错', async () => {
    const fresh = new MemoryAdapter();
    const env = createEnvelope({
      topic: TOPICS.TELEMETRY_RAW,
      source: 'simulator',
      payload: {},
    });
    await expect(fresh.publish(TOPICS.TELEMETRY_RAW, env)).rejects.toThrow();
  });

  it('health 返回 ok', async () => {
    const h = await bus.health();
    expect(h.status).toBe('ok');
  });
});
