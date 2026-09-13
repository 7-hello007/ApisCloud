import { z } from 'zod';

/**
 * 主题过滤器。
 * 只处理 payload 里 field 匹配 equals 或 in 的消息。
 * field 支持点分路径，如 'status' 或 'position.lat'。
 */
const TopicFilterSchema = z
  .object({
    field: z.string().min(1),
    equals: z.unknown().optional(),
    in: z.array(z.unknown()).optional(),
  })
  .refine((v) => v.equals !== undefined || v.in !== undefined, {
    message: 'filter 必须声明 equals 或 in',
  });

/**
 * plugin.json 校验 schema。
 * 一旦定下，属于核心契约，破坏性改动需版本化。
 */
export const PluginManifestSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9-]*$/, '插件名只能是小写字母、数字、连字符，且以字母开头'),
  version: z.string().min(1),
  core: z.boolean().default(false),
  profile: z.array(z.string()).default([]),
  lazy: z.boolean().default(true),
  dependsOn: z.array(z.string()).default([]),
  topics: z
    .object({
      subscribe: z.array(z.string()).default([]),
      publish: z.array(z.string()).default([]),
      filter: TopicFilterSchema.optional(),
    })
    .optional(),
  routes: z.array(z.string()).default([]),
  frontend: z.string().nullable().optional(),
});

export type PluginManifestInput = z.input<typeof PluginManifestSchema>;
export type TopicFilter = z.infer<typeof TopicFilterSchema>;
