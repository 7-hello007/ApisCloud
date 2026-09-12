import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

import type { AppConfig } from '../config';
import type { HealthCheckResult } from '../health';

export interface PgClient {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
  transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
  health(): Promise<HealthCheckResult>;
  close(): Promise<void>;
  raw(): Pool;
}

export function createPg(config: AppConfig): PgClient {
  const pool = new Pool({
    host: config.PG_HOST,
    port: config.PG_PORT,
    user: config.PG_USER,
    password: config.PG_PASSWORD,
    database: config.PG_DATABASE,
    max: config.PG_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err) => {
    // 空闲连接错误，不崩溃
    // eslint-disable-next-line no-console
    console.error('[pg] idle client error:', err.message);
  });

  return {
    async query<T extends QueryResultRow = QueryResultRow>(
      sql: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      return pool.query<T>(sql, params);
    },

    async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async health(): Promise<HealthCheckResult> {
      try {
        await pool.query('SELECT 1');
        return { status: 'ok' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { status: 'down', message };
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },

    raw(): Pool {
      return pool;
    },
  };
}
