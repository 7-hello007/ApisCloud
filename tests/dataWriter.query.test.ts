import type { HealthCheckResult, PgClient, RedisWrapper } from '@apiscloud/libs';
import {
  queryActiveVehicles,
  queryVehicleById,
  queryRecentAlerts,
  queryRecentCommands,
  type QueryContext,
} from '@apiscloud/data-writer';

interface MockPg extends PgClient {
  readonly queries: Array<{ sql: string; params?: unknown[] }>;
  setResponse: (rows: unknown[]) => void;
}

function createMockPg(): MockPg {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  let responseRows: unknown[] = [];
  return {
    queries,
    setResponse(rows: unknown[]) {
      responseRows = rows;
    },
    async query(sql: string, params?: unknown[]) {
      queries.push({ sql, params });
      return { rows: responseRows, rowCount: responseRows.length } as never;
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

interface MockRedis extends RedisWrapper {
  setSmembers: (members: string[]) => void;
  setLrange: (items: string[]) => void;
}

function createMockRedis(): MockRedis {
  let smembers: string[] = [];
  let lrange: string[] = [];
  return {
    setSmembers(items: string[]) {
      smembers = items;
    },
    setLrange(items: string[]) {
      lrange = items;
    },
    async get() {
      return null;
    },
    async set() {},
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
        sadd: async () => 1,
        smembers: async () => smembers,
        lpush: async () => 1,
        ltrim: async () => 'OK',
        lrange: async () => lrange,
      } as never;
    },
  } as MockRedis;
}

describe('dataWriter.query', () => {
  let pg: MockPg;
  let redis: MockRedis;
  let ctx: QueryContext;

  beforeEach(() => {
    pg = createMockPg();
    redis = createMockRedis();
    ctx = { pg, redis, limit: 100 };
  });

  describe('queryActiveVehicles', () => {
    it('无活跃车辆时返回空数组', async () => {
      redis.setSmembers([]);
      const result = await queryActiveVehicles(ctx);
      expect(result).toEqual([]);
    });

    it('从 Redis 拿 ID，从 PG 拿详情', async () => {
      redis.setSmembers(['v-1', 'v-2']);
      pg.setResponse([
        {
          vehicle_id: 'v-1',
          status: 'running',
          battery: 80,
          lat: 31.23,
          lng: 121.47,
          heading: 90,
          speed: 30,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]);
      const result = await queryActiveVehicles(ctx);
      expect(result).toHaveLength(1);
      expect(result[0].vehicle_id).toBe('v-1');
      expect(pg.queries).toHaveLength(1);
      expect(pg.queries[0].sql).toContain('vehicle_latest');
      expect(pg.queries[0].params).toEqual(['v-1', 'v-2']);
    });

    it('限制返回条数', async () => {
      const limitedCtx: QueryContext = { pg, redis, limit: 2 };
      redis.setSmembers(['v-1', 'v-2', 'v-3', 'v-4']);
      pg.setResponse([]);
      await queryActiveVehicles(limitedCtx);
      expect(pg.queries[0].params).toEqual(['v-1', 'v-2']);
    });
  });

  describe('queryVehicleById', () => {
    it('找到返回行', async () => {
      const row = {
        vehicle_id: 'v-1',
        status: 'idle',
        battery: 80,
        lat: null,
        lng: null,
        heading: null,
        speed: null,
        updated_at: null,
      };
      pg.setResponse([row]);
      const result = await queryVehicleById(ctx, 'v-1');
      expect(result).toEqual(row);
    });

    it('未找到返回 null', async () => {
      pg.setResponse([]);
      const result = await queryVehicleById(ctx, 'v-not-exist');
      expect(result).toBeNull();
    });
  });

  describe('queryRecentAlerts', () => {
    it('从 Redis lrange 解析 JSON', async () => {
      redis.setLrange([
        JSON.stringify({
          vehicle_id: 'v-1',
          alert_type: 'speed_anomaly',
          level: 'warning',
          message: 'speed too high',
          ts: 1700000000000,
        }),
      ]);
      const result = await queryRecentAlerts(ctx);
      expect(result).toHaveLength(1);
      expect(result[0].vehicle_id).toBe('v-1');
      expect(result[0].alert_type).toBe('speed_anomaly');
      expect(result[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('空列表返回空数组', async () => {
      redis.setLrange([]);
      const result = await queryRecentAlerts(ctx);
      expect(result).toEqual([]);
    });
  });

  describe('queryRecentCommands', () => {
    it('从 PG 查询 dispatch_commands', async () => {
      pg.setResponse([
        {
          command_id: 'cmd-1',
          vehicle_id: 'v-1',
          task_id: 'task-1',
          command_type: 'dispatch',
          status: 'pending',
          issued_at: '2026-01-01T00:00:00Z',
        },
      ]);
      const result = await queryRecentCommands(ctx);
      expect(result).toHaveLength(1);
      expect(result[0].command_id).toBe('cmd-1');
      expect(pg.queries[0].sql).toContain('dispatch_commands');
    });
  });
});
