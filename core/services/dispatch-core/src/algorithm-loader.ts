import fs from 'node:fs';
import path from 'node:path';

import { extractAlgorithm } from './algorithm-interface';
import type { DispatchAlgorithm } from './types';

/**
 * 算法插件目录结构：
 *   plugins/dispatch/
 *     ├── nearest/
 *     │   ├── plugin.json
 *     │   └── src/index.js
 *     ├── batch-match/
 *     └── priority-dispatch/
 */

/**
 * 从目录加载所有算法插件。
 * 跳过 _ 和 . 开头的目录。
 */
export function loadAlgorithmsFromDir(dir: string): DispatchAlgorithm[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const algorithms: DispatchAlgorithm[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

    const pluginDir = path.join(dir, entry.name);
    const entryFile = resolvePluginEntry(pluginDir);
    if (!entryFile) continue;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const moduleExports = require(entryFile);
    const algorithm = extractAlgorithm(moduleExports, entryFile);
    algorithms.push(algorithm);
  }

  return algorithms;
}

function resolvePluginEntry(pluginDir: string): string | null {
  const candidates = [
    path.join(pluginDir, 'dist', 'index.js'),
    path.join(pluginDir, 'src', 'index.js'),
    path.join(pluginDir, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
