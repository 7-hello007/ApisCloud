import { createEnvelope, MemoryAdapter, TOPICS } from '@apiscloud/message-bus';

describe('messageBus.partition', () => {
  it('MemoryAdapter 支持 partitionKey 选项', async () => {
    const bus = new MemoryAdapter();
    await bus.connect();

    const received: string[] = [];
    await bus.subscribe(TOPICS.TELEMETRY_RAW, async (env) => {
      received.push((env.payload as { vehicle_id: string }).vehicle_id);
    });

    // 同一车辆的消息带同一 partitionKey
    for (let i = 0; i < 3; i++) {
      const env = createEnvelope({
        topic: TOPICS.TELEMETRY_RAW,
        source: 'test',
        payload: { vehicle_id: 'v-000001', seq: i },
      });
      await bus.publish(TOPICS.TELEMETRY_RAW, env, {
        partitionKey: 'v-000001',
      });
    }

    expect(received).toEqual(['v-000001', 'v-000001', 'v-000001']);

    await bus.close();
  });

  it('不同车辆的消息独立', async () => {
    const bus = new MemoryAdapter();
    await bus.connect();

    const received: string[] = [];
    await bus.subscribe(TOPICS.TELEMETRY_RAW, async (env) => {
      received.push((env.payload as { vehicle_id: string }).vehicle_id);
    });

    for (const id of ['v-1', 'v-2', 'v-3']) {
      const env = createEnvelope({
        topic: TOPICS.TELEMETRY_RAW,
        source: 'test',
        payload: { vehicle_id: id },
      });
      await bus.publish(TOPICS.TELEMETRY_RAW, env, { partitionKey: id });
    }

    expect(received).toEqual(['v-1', 'v-2', 'v-3']);

    await bus.close();
  });

  it('events.commands 也支持 partitionKey = vehicle_id', async () => {
    const bus = new MemoryAdapter();
    await bus.connect();

    const received: string[] = [];
    await bus.subscribe(TOPICS.EVENTS_COMMANDS, async (env) => {
      received.push((env.payload as { vehicle_id: string }).vehicle_id);
    });

    const env = createEnvelope({
      topic: TOPICS.EVENTS_COMMANDS,
      source: 'dispatch-core',
      payload: { vehicle_id: 'v-000042', command_id: 'cmd-1' },
    });
    await bus.publish(TOPICS.EVENTS_COMMANDS, env, { partitionKey: 'v-000042' });

    expect(received).toEqual(['v-000042']);

    await bus.close();
  });
});
