import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import type { AppConfig } from '../config';
import type { HealthCheckResult } from '../health';
export interface PgClient {
    query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
    health(): Promise<HealthCheckResult>;
    close(): Promise<void>;
    raw(): Pool;
}
export declare function createPg(config: AppConfig): PgClient;
//# sourceMappingURL=index.d.ts.map