#!/usr/bin/env node

/**
 * 扫描 core/services 和 plugins 目录，生成 registry.json。
 * 阶段 1.1 只做骨架，阶段 1.9 完善。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY_DIR = path.join(ROOT, 'core', 'registry');
const REGISTRY_FILE = path.join(REGISTRY_DIR, 'registry.json');

const SCAN_DIRS = [
  path.join(ROOT, 'core', 'services'),
  path.join(ROOT, 'plugins'),
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readPluginManifest(dir) {
  const manifestPath = path.join(dir, 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[registry] 无法解析 ${manifestPath}: ${err.message}`);
    return null;
  }
}

function scanDir(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return [];
  }
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const dir = path.join(baseDir, entry.name);
    const manifest = readPluginManifest(dir);
    if (manifest) {
      result.push({
        name: manifest.name || entry.name,
        version: manifest.version || '0.0.0',
        core: !!manifest.core,
        profile: manifest.profile || [],
        lazy: manifest.lazy !== false,
        dependsOn: manifest.dependsOn || [],
        path: path.relative(ROOT, dir),
      });
    }
  }
  return result;
}

function main() {
  ensureDir(REGISTRY_DIR);

  const services = scanDir(SCAN_DIRS[0]);
  const plugins = scanDir(SCAN_DIRS[1]);

  const registry = {
    version: '1',
    generatedAt: new Date().toISOString(),
    services,
    plugins,
  };

  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
  console.log(
    `[registry] 已生成 ${path.relative(ROOT, REGISTRY_FILE)}：` +
      `${services.length} 个服务，${plugins.length} 个插件`,
  );
}

main();
