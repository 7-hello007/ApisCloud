import { createE2eEnv, destroyE2eEnv, pushTelemetry, type E2eEnv } from './helpers/e2e-setup';
import { makeTelemetry } from './helpers/e2e-infra';
import { waitFor } from './helpers';

/**
 * e2e 全链路测试：simulator → MQTT → ingest → 总线 → data-writer → PG/Redis。
 *
 * 用 MemoryAdapter 在同一进程内跑通全部数据流，
 * 不需要 Docker，不需要真实 Kafka/MQTT/PG/Redis。
 */
describe('e2e.fullPipeline', () => {
  let env: E2eEnv;

  beforeEach(async () => {
    env = await createE2eEnv();
  });

  afterEach(async () => {
    await destroyE2eEnv(env);
  });

  describe('遥测上行全链路', () => {
    it('单条遥测：MQTT → 总线 → PG vehicle_latest + vehicle_telemetry', async () => {
      const telemetry = makeTelemetry('v-000001');
      pushTelemetry(env, telemetry);

      await waitFor(() => env.mockPg.queriesBySql('vehicle_latest').length >= 1);

      const latest = env.mockPg.queriesBySql('vehicle_latest')[0];
      expect(latest.params).toEqual(['v-000001', 'running', 80, 31.2304, 121.4737, 90, 30]);

      const telemetry2 = env.mockPg.queriesBySql('vehicle_telemetry');
      expect(telemetry2).toHaveLength(1);
      expect(telemetry2[0].params).toHaveLength(8);
    });

    it('单条遥测写 Redis 热路径：vehicle:{id}:latest + vehicles:active', async () => {
      pushTelemetry(env, makeTelemetry('v-000002'));

      await waitFor(() => env.mockRedis.sets.length >= 1);

      const latestSet = env.mockRedis.sets.find((s) => s.key === 'vehicle:v-000002:latest');
      expect(latestSet).toBeDefined();
      expect(latestSet!.ttl).toBe(60);

      const sadd = env.mockRedis.sadds.find((s) => s.key === 'vehicles:active');
      expect(sadd).toBeDefined();
      expect(sadd!.member).toBe('v-000002');
    });

    it('多条遥测：100 辆车全部落 PG', async () => {
      for (let i = 0; i < 100; i++) {
        pushTelemetry(env, makeTelemetry(`v-${String(i + 1).padStart(6, '0')}`));
      }

      await waitFor(() => env.mockPg.queriesBySql('vehicle_latest').length >= 100, {
        timeoutMs: 5000,
      });

      const upserts = env.mockPg.queriesBySql('vehicle_latest');
      expect(upserts).toHaveLength(100);

      const ids = new Set(upserts.map((u) => u.params![0]));
      expect(ids.size).toBe(100);
    });

    it('边界：非法遥测（缺字段）不进入总线也不写 PG', async () => {
      const handler = env.mockMqttSubscriber.getHandler();
      expect(handler).not.toBeNull();

      handler!(Buffer.from(JSON.stringify({ vehicle_id: '', ts: -1 })));

      await new Promise((r) => setTimeout(r, 100));
      expect(env.mockPg.queries).toHaveLength(0);
      expect(env.mockRedis.sets).toHaveLength(0);
    });

    it('边界：非 JSON payload 不崩溃', async () => {
      const handler = env.mockMqttSubscriber.getHandler();
      handler!(Buffer.from('this is not json'));

      await new Promise((r) => setTimeout(r, 100));
      expect(env.mockPg.queries).toHaveLength(0);
    });
  });

  describe('遥测下行全链路', () => {
    it('命令：总线 events.commands → MQTT commands/{vehicle_id}', async () => {
      // 通过 ingest 的总线订阅接收 events.commands，再发 MQTT
      // 这里直接往总线发一条 events.commands
      const { createEnvelope, TOPICS } = await import('@apiscloud/message-bus');
      const env2 = createEnvelope({
        topic: TOPICS.EVENTS_COMMANDS,
        source: 'e2e-test',
        payload: {
          vehicle_id: 'v-000001',
          command_id: 'cmd-e2e-1',
          command_type: 'dispatch',
          payload: { task_id: 'task-e2e-1' },
        },
      });
      await env.bus.publish(TOPICS.EVENTS_COMMANDS, env2, {
        partitionKey: 'v-000001',
      });

      await waitFor(() => env.mockMqttPublisher.calls.length >= 1);

      const call = env.mockMqttPublisher.calls[0];
      expect(call.topic).toBe('commands/v-000001');
      const cmd = call.payload as { command_id: string; command_type: string };
      expect(cmd.command_id).toBe('cmd-e2e-1');
      expect(cmd.command_type).toBe('dispatch');
    });
  });

  describe('规模：500 辆模拟车辆', () => {
    it('500 辆车全部落 PG，Redis 活跃集合包含 500 个 ID', async () => {
      for (let i = 0; i < 500; i++) {
        pushTelemetry(env, makeTelemetry(`v-${String(i + 1).padStart(6, '0')}`));
      }

      // 同时等 PG 和 Redis 都到 500，避免 Redis 落后于 PG
      await waitFor(
        () =>
          env.mockPg.queriesBySql('vehicle_latest').length >= 500 &&
          env.mockRedis.sets.length >= 500 &&
          env.mockRedis.sadds.length >= 500,
        { timeoutMs: 15000 },
      );

      expect(env.mockPg.queriesBySql('vehicle_latest')).toHaveLength(500);
      expect(env.mockPg.queriesBySql('vehicle_telemetry')).toHaveLength(500);
      expect(env.mockRedis.sets).toHaveLength(500);
      expect(env.mockRedis.sadds).toHaveLength(500);

      const uniqueActive = new Set(env.mockRedis.sadds.map((s) => s.member));
      expect(uniqueActive.size).toBe(500);
    });
  });
});
