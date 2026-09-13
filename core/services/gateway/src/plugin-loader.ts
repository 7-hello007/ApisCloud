import fs from 'node:fs';
import path from 'node:path';

import type { Logger } from '@apiscloud/libs';
import { loadPlugin, type LoadedPlugin } from '@apiscloud/plugin-host';

export interface PluginLoaderOptions {
  dirs: string[];
  logger?: Logger;
}

export interface PluginLoadResult {
  plugins: LoadedPlugin[];
  errors: Array<{ dir: string; error: string }>;
}

/**
 * 从多个目录扫描并加载插件。
 * 跳过 _ 和 . 开头的目录。
 * 单个插件加载失败不影响其他插件。
 */
export function loadPluginsFromDirs(options: PluginLoaderOptions): PluginLoadResult {
  const { dirs, logger } = options;
  const plugins: LoadedPlugin[] = [];
  const errors: Array<{ dir: string; error: string }> = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      logger?.debug({ dir }, '插件目录不存在，跳过');
      continue;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

      const pluginDir = path.join(dir, entry.name);
      const manifestPath = path.join(pluginDir, 'plugin.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const loaded = loadPlugin(pluginDir);
        plugins.push(loaded);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ dir: pluginDir, error: message });
        logger?.warn({ pluginDir, err: message }, '插件加载失败');
      }
    }
  }

  return { plugins, errors };
}
