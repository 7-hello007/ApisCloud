import type { PgClient } from '@apiscloud/libs';
import { createPgWriter } from '@apiscloud/data-writer';

interface MockPgClient extends PgClient {
  readonly queries: Array<{ sql: string; params?: unknown[] }>;
}

function createMockPg(): MockPgClient {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  return {
    queries,
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [], rowCount: 0 } as never;
    }),
    transaction: jest.fn() as never,
    health: jest.fn(async () => ({ status: 'ok' as const })),
    close: jest.fn(async () => undefined),
    raw: jest.fn() as never,
  };
}

describe('dataWriter.pgWriter', () => {
  const telemetry = {
    vehicle_id: 'v-000001',
    ts: Date.now(),
    lat: 31.23,
    lng: 121.47,
    speed: 30,
    battery: 80,
    heading: 90,
    status: 'running' as const,
  };

  it('upsertVehicleLatest 执行 UPSERT SQL', async () => {
    const pg = createMockPg();
    const writer = createPgWriter(pg);

    await writer.upsertVehicleLatest(telemetry);

    expect(pg.queries).toHaveLength(1);
    expect(pg.queries[0].sql).toContain('INSERT INTO vehicle_latest');
    expect(pg.queries[0].sql).toContain('ON CONFLICT (vehicle_id) DO UPDATE');
    expect(pg.queries[0].params).toEqual([
      'v-000001',
      'running',
      80,
      31.23,
      121.47,
      90,
      30,
    ]);
  });

  it('insertTelemetry 执行 INSERT SQL', async () => {
    const pg = createMockPg();
    const writer = createPgWriter(pg);

    await writer.insertTelemetry(telemetry);

    expect(pg.queries).toHaveLength(1);
    expect(pg.queries[0].sql).toContain('INSERT INTO vehicle_telemetry');
    expect(pg.queries[0].params).toHaveLength(8);
    expect(pg.queries[0].params![0]).toBe('v-000001');
  });

  it('insertAlert 执行 INSERT SQL', async () => {
    const pg = createMockPg();
    const writer = createPgWriter(pg);

    await writer.insertAlert({
      vehicle_id: 'v-000001',
      alert_type: 'speed',
      level: 'warning',
      message: 'speed too high',
    });

    expect(pg.queries).toHaveLength(1);
    expect(pg.queries[0].sql).toContain('INSERT INTO alerts');
    expect(pg.queries[0].params).toEqual([
      'v-000001',
      'speed',
      'warning',
      'speed too high',
      null,
    ]);
  });

  it('多次调用写入多次', async () => {
    const pg = createMockPg();
    const writer = createPgWriter(pg);

    await writer.upsertVehicleLatest(telemetry);
    await writer.insertTelemetry(telemetry);
    await writer.insertAlert({
      vehicle_id: 'v-000001',
      alert_type: 'speed',
      level: 'warning',
      message: 'x',
    });

    expect(pg.queries).toHaveLength(3);
  });
});
