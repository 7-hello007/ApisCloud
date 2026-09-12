import { z } from 'zod';

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
    })
    .optional(),
  routes: z.array(z.string()).default([]),
  frontend: z.string().nullable().optional(),
});

export type PluginManifestInput = z.input<typeof PluginManifestSchema>;
