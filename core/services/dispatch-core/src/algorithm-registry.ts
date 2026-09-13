import type { DispatchAlgorithm } from './types';

/**
 * 算法注册表。
 * 按名唯一，支持注册、查询、列举。
 */
export class AlgorithmRegistry {
  private readonly algorithms = new Map<string, DispatchAlgorithm>();

  register(algorithm: DispatchAlgorithm): void {
    if (this.algorithms.has(algorithm.name)) {
      throw new Error(`算法已注册：${algorithm.name}`);
    }
    this.algorithms.set(algorithm.name, algorithm);
  }

  unregister(name: string): boolean {
    return this.algorithms.delete(name);
  }

  get(name: string): DispatchAlgorithm | undefined {
    return this.algorithms.get(name);
  }

  has(name: string): boolean {
    return this.algorithms.has(name);
  }

  list(): DispatchAlgorithm[] {
    return Array.from(this.algorithms.values());
  }

  names(): string[] {
    return Array.from(this.algorithms.keys()).sort();
  }

  size(): number {
    return this.algorithms.size;
  }

  clear(): void {
    this.algorithms.clear();
  }
}
