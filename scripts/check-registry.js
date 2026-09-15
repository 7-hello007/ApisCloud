#!/usr/bin/env node
'use strict';

const path = require('path');

const REGISTRY_FILE = path.resolve(__dirname, '..', 'core', 'registry', 'registry.json');

function main() {
  let r;
  try {
    r = require(REGISTRY_FILE);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[registry] 无法读取 registry.json：${message}`);
    process.exit(1);
  }

  if (!r.version) {
    console.error('[registry] 缺少 version 字段');
    process.exit(1);
  }
  if (!Array.isArray(r.plugins)) {
    console.error('[registry] plugins 不是数组');
    process.exit(1);
  }
  if (!Array.isArray(r.services)) {
    console.error('[registry] services 不是数组');
    process.exit(1);
  }
  if (!Array.isArray(r.topologicalOrder)) {
    console.error('[registry] topologicalOrder 不是数组');
    process.exit(1);
  }

  console.log(`[registry] 校验通过：${r.plugins.length} 个插件，${r.services.length} 个服务`);
}

main();
