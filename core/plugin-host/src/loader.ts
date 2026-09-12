import fs from 'node:fs';
import path from 'node:path';

import { PluginManifestSchema } from './schema';
import type { LoadedPlugin, Plugin, PluginManifest } from './types';

/**
 * 读取 plugin.json 并校验。
 */
export function readManifest(pluginDir: string): PluginManifest {
  const manifestPath = path.join(pluginDir, 'plugin.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`plugin.json 不存在：${manifestPath}`);
  }

  const raw = fs.readFileSync(manifestPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`plugin.json 解析失败 ${manifestPath}：${message}`);
  }

  const result = PluginManifestSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`plugin.json 校验失败 ${manifestPath}：${issues}`);
  }

  return result.data as PluginManifest;
}

/**
 * 找插件入口文件。
 * 优先级：dist/index.js > src/index.js > index.js
 */
export function resolveEntry(pluginDir: string): string {
  const candidates = [
    path.join(pluginDir, 'dist', 'index.js'),
    path.join(pluginDir, 'src', 'index.js'),
    path.join(pluginDir, 'index.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`插件入口不存在，已尝试：${candidates.join(', ')}`);
}

/**
 * 动态加载插件模块。
 * 默认导出优先，否则用 module 本身。
 */
export function loadPluginInstance(entryPath: string): Plugin {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(entryPath);
  const instance = mod && mod.default ? mod.default : mod;

  if (!instance || typeof instance !== 'object') {
    throw new Error(`插件入口未导出对象：${entryPath}`);
  }

  return instance as Plugin;
}

/**
 * 从插件目录完整加载：manifest + instance。
 */
export function loadPlugin(pluginDir: string): LoadedPlugin {
  const manifest = readManifest(pluginDir);
  const entry = resolveEntry(pluginDir);
  const instance = loadPluginInstance(entry);

  return {
    manifest,
    instance,
    path: pluginDir,
    loadedAt: Date.now(),
  };
}
