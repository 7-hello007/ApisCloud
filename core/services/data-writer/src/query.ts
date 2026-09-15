import type { PgClient, RedisWrapper } from '@apiscloud/libs';

import type { AlertQueryRow, CommandQueryRow, VehicleQueryRow } from './types';

export interface QueryContext {
  redis: RedisWrapper;
  pg: PgClient;
  limit: number;
}

const ACTIVE_VEHICLES_KEY = 'vehicles:active';
const RECENT_ALERTS_KEY = 'alerts:recent';

/**
 * 把 NUMERIC 字段显式转 float8，避免 pg 返回字符串。
 */
const VEHICLE_SELECT_FIELDS = `
  vehicle_id,
  status,
  battery::float8   AS battery,
  lat,
  lng,
  heading::float8   AS heading,
  speed::float8     AS speed,
  updated_at
`;

/**
 * 查活跃车辆列表。
 */
export async function queryActiveVehicles(ctx: QueryContext): Promise<VehicleQueryRow[]> {
  const client = ctx.redis.raw();

  const ids = (await client.smembers(ACTIVE_VEHICLES_KEY)) as string[];
  const limitedIds = ids.slice(0, ctx.limit);

  if (limitedIds.length === 0) return [];

  const placeholders = limitedIds.map((_, i) => `$${i + 1}`).join(',');
  const sql = `
    SELECT ${VEHICLE_SELECT_FIELDS}
    FROM vehicle_latest
    WHERE vehicle_id IN (${placeholders})
    ORDER BY updated_at DESC
  `;
  const result = await ctx.pg.query<VehicleQueryRow>(sql, limitedIds);
  return result.rows;
}

/**
 * 按 ID 查单车最新状态。
 */
export async function queryVehicleById(
  ctx: QueryContext,
  vehicleId: string,
): Promise<VehicleQueryRow | null> {
  const sql = `
    SELECT ${VEHICLE_SELECT_FIELDS}
    FROM vehicle_latest
    WHERE vehicle_id = $1
  `;
  const result = await ctx.pg.query<VehicleQueryRow>(sql, [vehicleId]);
  return result.rows[0] ?? null;
}

/**
 * 查最近告警。
 */
export async function queryRecentAlerts(ctx: QueryContext): Promise<AlertQueryRow[]> {
  const client = ctx.redis.raw();
  const raws = (await client.lrange(RECENT_ALERTS_KEY, 0, ctx.limit - 1)) as string[];

  return raws.map((raw) => {
    const parsed = JSON.parse(raw) as {
      vehicle_id: string;
      alert_type: string;
      level: string;
      message: string;
      ts?: number;
    };
    return {
      vehicle_id: parsed.vehicle_id,
      alert_type: parsed.alert_type,
      level: parsed.level,
      message: parsed.message,
      created_at: new Date(parsed.ts ?? Date.now()).toISOString(),
    };
  });
}

/**
 * 查最近的调度命令。
 */
export async function queryRecentCommands(ctx: QueryContext): Promise<CommandQueryRow[]> {
  const sql = `
    SELECT command_id, vehicle_id, task_id, command_type, status, issued_at
    FROM dispatch_commands
    ORDER BY issued_at DESC
    LIMIT $1
  `;
  const result = await ctx.pg.query<CommandQueryRow>(sql, [ctx.limit]);
  return result.rows;
}
