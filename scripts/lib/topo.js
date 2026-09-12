'use strict';

/**
 * 按 dependsOn 做拓扑排序。
 * 使用 Kahn 算法，稳定输出（同层按名字排序）。
 *
 * @param {Array<{name: string, dependsOn: string[]}>} items
 * @returns {string[]} 拓扑序的插件名列表
 * @throws {Error} 存在循环依赖或缺失依赖时抛错
 */
function topologicalSort(items) {
  const graph = new Map();
  const inDegree = new Map();
  const byName = new Map();

  for (const item of items) {
    byName.set(item.name, item);
    graph.set(item.name, []);
    inDegree.set(item.name, 0);
  }

  // 建边：dep -> item
  for (const item of items) {
    for (const dep of item.dependsOn) {
      if (!byName.has(dep)) {
        throw new Error(`${item.name} 依赖的 ${dep} 不存在`);
      }
      graph.get(dep).push(item.name);
      inDegree.set(item.name, inDegree.get(item.name) + 1);
    }
  }

  // Kahn：所有入度为 0 的入队，按名字排序保证稳定
  const queue = [];
  for (const [name, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(name);
    }
  }
  queue.sort();

  const result = [];
  while (queue.length > 0) {
    const name = queue.shift();
    result.push(name);

    const neighbors = graph.get(name).slice().sort();
    for (const next of neighbors) {
      const newDegree = inDegree.get(next) - 1;
      inDegree.set(next, newDegree);
      if (newDegree === 0) {
        queue.push(next);
        queue.sort();
      }
    }
  }

  if (result.length !== items.length) {
    const remaining = items
      .map((i) => i.name)
      .filter((n) => !result.includes(n));
    throw new Error(`检测到循环依赖：${remaining.join(' -> ')}`);
  }

  return result;
}

module.exports = { topologicalSort };
