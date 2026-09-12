'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 扫描指定目录下的所有子目录，找 plugin.json。
 * 跳过：
 *   - 下划线开头的目录（如 _template）
 *   - 点开头的目录
 *   - 没有 plugin.json 的目录
 *
 * @param {string} baseDir 扫描根目录
 * @returns {Array<{dir: string, manifestPath: string, raw: object}>}
 */
function scanDir(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue;
    if (entry.name.startsWith('.')) continue;

    const dir = path.join(baseDir, entry.name);
    const manifestPath = path.join(dir, 'plugin.json');

    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`解析 ${manifestPath} 失败：${message}`);
    }

    results.push({ dir, manifestPath, raw });
  }

  return results;
}

module.exports = { scanDir };
