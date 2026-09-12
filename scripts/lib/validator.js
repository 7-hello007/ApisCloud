'use strict';

const PLUGIN_NAME_RE = /^[a-z][a-z0-9-]*$/;

const ALLOWED_TOP_KEYS = new Set([
  'name',
  'version',
  'core',
  'profile',
  'lazy',
  'dependsOn',
  'topics',
  'routes',
  'frontend',
  'description',
]);

/**
 * 校验并规范化 manifest。
 * 补默认值，格式和 core/plugin-host/src/types.ts 的 PluginManifest 对齐。
 *
 * @param {object} raw
 * @param {string} manifestPath 用于报错定位
 * @returns {object} 规范化后的 manifest
 */
function validateManifest(raw, manifestPath) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${manifestPath}: plugin.json 必须是对象`);
  }

  // 未知字段警告（不报错，便于向后兼容）
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_TOP_KEYS.has(key)) {
      console.warn(`[registry] 未知字段 ${key}（${manifestPath}）`);
    }
  }

  // name
  if (typeof raw.name !== 'string' || !PLUGIN_NAME_RE.test(raw.name)) {
    throw new Error(
      `${manifestPath}: name 必须是小写字母、数字、连字符，且以字母开头`,
    );
  }

  // version
  if (typeof raw.version !== 'string' || raw.version.length === 0) {
    throw new Error(`${manifestPath}: version 必须是非空字符串`);
  }

  // core
  const core = raw.core === undefined ? false : raw.core;
  if (typeof core !== 'boolean') {
    throw new Error(`${manifestPath}: core 必须是布尔值`);
  }

  // profile
  const profile = raw.profile === undefined ? [] : raw.profile;
  if (!Array.isArray(profile) || profile.some((p) => typeof p !== 'string')) {
    throw new Error(`${manifestPath}: profile 必须是字符串数组`);
  }

  // lazy
  const lazy = raw.lazy === undefined ? true : raw.lazy;
  if (typeof lazy !== 'boolean') {
    throw new Error(`${manifestPath}: lazy 必须是布尔值`);
  }

  // dependsOn
  const dependsOn = raw.dependsOn === undefined ? [] : raw.dependsOn;
  if (!Array.isArray(dependsOn) || dependsOn.some((d) => typeof d !== 'string')) {
    throw new Error(`${manifestPath}: dependsOn 必须是字符串数组`);
  }
  for (const dep of dependsOn) {
    if (!PLUGIN_NAME_RE.test(dep)) {
      throw new Error(`${manifestPath}: dependsOn 里的 ${dep} 不是合法的插件名`);
    }
  }

  // topics
  const topics = raw.topics || {};
  const subscribe = Array.isArray(topics.subscribe) ? topics.subscribe : [];
  const publish = Array.isArray(topics.publish) ? topics.publish : [];

  // routes
  const routes = Array.isArray(raw.routes) ? raw.routes : [];

  // frontend
  const frontend = raw.frontend === undefined ? null : raw.frontend;
  if (frontend !== null && typeof frontend !== 'string') {
    throw new Error(`${manifestPath}: frontend 必须是字符串或 null`);
  }

  return {
    name: raw.name,
    version: raw.version,
    core,
    profile,
    lazy,
    dependsOn,
    topics: { subscribe, publish },
    routes,
    frontend,
    description: typeof raw.description === 'string' ? raw.description : undefined,
  };
}

module.exports = { validateManifest, PLUGIN_NAME_RE };
