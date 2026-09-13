import type { DispatchAlgorithm } from './types';

/**
 * 算法插件模块的导出结构。
 * 算法插件在 src/index.js 里导出：
 *   module.exports = { algorithm: { name, version, rank } };
 */
export interface AlgorithmModule {
  algorithm?: DispatchAlgorithm;
}

/**
 * 从插件实例中提取 algorithm。
 * 如果导出不合法，抛错。
 */
export function extractAlgorithm(moduleExports: unknown, pluginPath: string): DispatchAlgorithm {
  if (!moduleExports || typeof moduleExports !== 'object') {
    throw new Error(`算法插件导出不是对象：${pluginPath}`);
  }

  const mod = moduleExports as AlgorithmModule;
  const algorithm = mod.algorithm;

  if (!algorithm || typeof algorithm !== 'object') {
    throw new Error(`算法插件未导出 algorithm 字段：${pluginPath}`);
  }
  if (typeof algorithm.name !== 'string' || algorithm.name.length === 0) {
    throw new Error(`算法插件 algorithm.name 非法：${pluginPath}`);
  }
  if (typeof algorithm.version !== 'string' || algorithm.version.length === 0) {
    throw new Error(`算法插件 algorithm.version 非法：${pluginPath}`);
  }
  if (typeof algorithm.rank !== 'function') {
    throw new Error(`算法插件 algorithm.rank 不是函数：${pluginPath}`);
  }

  return algorithm;
}

/**
 * 类型守卫：判断某对象是不是合法算法。
 */
export function isDispatchAlgorithm(value: unknown): value is DispatchAlgorithm {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === 'string' &&
    typeof v.version === 'string' &&
    typeof v.rank === 'function'
  );
}