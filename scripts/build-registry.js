#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { buildProfileIndex } = require('./lib/profiles');
const { scanDir } = require('./lib/scanner');
const { topologicalSort } = require('./lib/topo');
const { validateManifest } = require('./lib/validator');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY_DIR = path.join(ROOT, 'core', 'registry');
const REGISTRY_FILE = path.join(REGISTRY_DIR, 'registry.json');

const CORE_VERSION = '0.1.0';

/**
 * 构建注册表。
 * 导出为函数便于单测。
 *
 * @param {object} [options]
 * @param {boolean} [options.write=true] 是否写文件
 * @param {string}  [options.root]       仓库根目录
 * @returns {object} registry 对象
 */
function buildRegistry(options = {}) {
  const write = options.write !== false;
  const root = options.root ?? ROOT;

  const serviceDirs = options.serviceDirs ?? path.join(root, 'core', 'services');
  const pluginDirs = options.pluginDirs ?? [
    path.join(root, 'plugins'),
    path.join(root, 'plugins', 'dispatch'),
  ];

  const services = collectFrom(serviceDirs, true);
  const plugins = collectFrom(pluginDirs, false);

  const allItems = [...services, ...plugins];

  // 重名检查必须在拓扑排序之前
  const names = new Set();
  for (const item of allItems) {
    if (names.has(item.name)) {
      throw new Error(`插件名重复：${item.name}`);
    }
    names.add(item.name);
  }

  const byProfile = buildProfileIndex(allItems);
  const topologicalOrder = topologicalSort(allItems);

  const registry = {
    version: '1',
    generatedAt: new Date().toISOString(),
    generator: `apiscloud-registry/${CORE_VERSION}`,
    coreVersion: CORE_VERSION,
    services,
    plugins,
    byProfile,
    topologicalOrder,
    stats: {
      totalServices: services.length,
      totalPlugins: plugins.length,
      totalByProfile: Object.fromEntries(Object.entries(byProfile).map(([k, v]) => [k, v.length])),
    },
  };

  if (write) {
    ensureDir(path.dirname(REGISTRY_FILE));
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
    // eslint-disable-next-line no-console
    console.log(
      `[registry] 已生成 ${path.relative(root, REGISTRY_FILE)}：` +
        `${services.length} 个服务，${plugins.length} 个插件`,
    );
  }

  return registry;
}

/**
 * 从指定目录（或目录数组）扫描并校验所有 plugin.json。
 *
 * @param {string|string[]} baseDirs 单个目录或目录数组
 * @param {boolean} isCore 是否强制 core=true
 */
function collectFrom(baseDirs, isCore) {
  const dirs = Array.isArray(baseDirs) ? baseDirs : [baseDirs];
  const result = [];

  for (const baseDir of dirs) {
    const entries = scanDir(baseDir);
    for (const { dir, manifestPath, raw } of entries) {
      const manifest = validateManifest(raw, manifestPath);

      if (isCore && !manifest.core) {
        throw new Error(`${manifestPath}: core/services 下的插件必须 core=true`);
      }

      result.push({
        ...manifest,
        path: path.relative(ROOT, dir).split(path.sep).join('/'),
      });
    }
  }

  // 同一插件不能同时被两个目录扫描到
  const names = new Set();
  for (const item of result) {
    if (names.has(item.name)) {
      throw new Error(`插件被重复扫描：${item.name}`);
    }
    names.add(item.name);
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// CLI 入口
if (require.main === module) {
  try {
    buildRegistry();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[registry] 生成失败：${err.message}`);
    process.exit(1);
  }
}

module.exports = { buildRegistry };
