import { z } from 'zod';
import { Battery, Latitude, Longitude, VehicleId } from '@apiscloud/libs';

/**
 * 上行遥测 schema。
 * 与 simulator 输出对齐，拒绝非法数据。
 */
export const UplinkTelemetrySchema = z.object({
  vehicle_id: VehicleId,
  ts: z.number().int().positive(),
  lat: Latitude,
  lng: Longitude,
  speed: z.number().min(0).max(500),
  battery: Battery,
  heading: z.number().min(0).max(360),
  status: z.enum(['idle', 'running', 'charging', 'maintenance', 'offline']),
});

export type ValidatedTelemetry = z.infer<typeof UplinkTelemetrySchema>;

/**
 * 下行命令 schema。
 */
export const DownlinkCommandSchema = z.object({
  vehicle_id: VehicleId,
  command_id: z.string().min(1).max(128),
  command_type: z.string().min(1).max(64),
  payload: z.unknown(),
});

export type ValidatedCommand = z.infer<typeof DownlinkCommandSchema>;