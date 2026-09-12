import fs from 'node:fs';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

import { LayersConfigSchema, type Layer, type LayersConfig } from './schema';

export interface LayerLoaderOptions {
  /** layers.yml 路径，默认取当前包目录下的 layers.yml */
  filePath?: string;
}

/**
 * 加载并校验 layers.yml。
 */
export function loadLayers(options: LayerLoaderOptions = {}): LayersConfig {
  const filePath = options.filePath ?? path.join(__dirname, '..', 'layers.yml');

  if (!fs.existsSync(filePath)) {
    throw new Error(`层配置文件不存在：${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`layers.yml 解析失败：${message}`);
  }

  const result = LayersConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`layers.yml 校验失败：\n${issues}`);
  }

  // 层名唯一性校验（zod 不直接支持）
  const names = result.data.layers.map((l) => l.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) {
    throw new Error(`层名重复：${dup}`);
  }

  return result.data;
}

/**
 * 从配置中按名字取某一层。
 */
export function getLayer(config: LayersConfig, name: string): Layer {
  const layer = config.layers.find((l) => l.name === name);
  if (!layer) {
    throw new Error(`层不存在：${name}`);
  }
  return layer;
}

/**
 * 取某层启用的服务清单。
 */
export function getServices(config: LayersConfig, layerName: string): string[] {
  return [...getLayer(config, layerName).services];
}

/**
 * 取所有层名。
 */
export function getLayerNames(config: LayersConfig): string[] {
  return config.layers.map((l) => l.name);
}

/**
 * 检查某服务是否在某层启用。
 */
export function isServiceEnabled(
  config: LayersConfig,
  layerName: string,
  service: string,
): boolean {
  return getLayer(config, layerName).services.includes(service as never);
}
