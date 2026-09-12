"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPg = createPg;
const pg_1 = require("pg");
function createPg(config) {
    const pool = new pg_1.Pool({
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
        async query(sql, params) {
            return pool.query(sql, params);
        },
        async transaction(fn) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const result = await fn(client);
                await client.query('COMMIT');
                return result;
            }
            catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
            finally {
                client.release();
            }
        },
        async health() {
            try {
                await pool.query('SELECT 1');
                return { status: 'ok' };
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { status: 'down', message };
            }
        },
        async close() {
            await pool.end();
        },
        raw() {
            return pool;
        },
    };
}
//# sourceMappingURL=index.js.map