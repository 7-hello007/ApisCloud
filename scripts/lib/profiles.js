'use strict';

/**
 * 按 profile 建立索引：profile → [plugin names]。
 * 同时生成 "all" 伪 profile，包含所有插件。
 *
 * @param {Array<{name: string, profile: string[]}>} items
 * @returns {object}
 */
function buildProfileIndex(items) {
  /** @type {Record<string, string[]>} */
  const index = {};

  for (const item of items) {
    for (const profile of item.profile) {
      if (!index[profile]) {
        index[profile] = [];
      }
      index[profile].push(item.name);
    }
  }

  // 所有 profile 内的插件名去重 + 排序
  for (const key of Object.keys(index)) {
    index[key] = Array.from(new Set(index[key])).sort();
  }

  // 加 "all" 伪 profile
  index.all = items.map((i) => i.name).sort();

  return index;
}

module.exports = { buildProfileIndex };
