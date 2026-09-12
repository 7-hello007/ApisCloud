import { z } from 'zod';

/**
 * 已知服务名白名单。
 * 新增核心服务时，在这里加一条。
 */
export const KNOWN_SERVICES = [
  'infra',
  'gateway',
  'plugin-host',
  'libs',
  'ingest',
  'data-writer',
  'simulator',
  'dispatch-core',
  'observability',
  'registry',
] as const;

export type KnownService = (typeof KNOWN_SERVICES)[number];

const ServiceSchema = z.enum(KNOWN_SERVICES);

const LayerSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9-]*$/, '层名只能是小写字母、数字、连字符，且以字母开头'),
  description: z.string().optional(),
  services: z.array(ServiceSchema).min(1, '每层至少启用一个服务'),
});

export const LayersConfigSchema = z.object({
  version: z.string().min(1).default('1'),
  layers: z.array(LayerSchema).min(1, '至少声明一层'),
});

export type LayersConfig = z.infer<typeof LayersConfigSchema>;
export type Layer = z.infer<typeof LayerSchema>;
