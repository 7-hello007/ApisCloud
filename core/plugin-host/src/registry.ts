import type { LoadedPlugin } from './types';

/**
 * 插件内存注册表。
 * 按名唯一，支持按 profile / core 过滤。
 */
export class PluginRegistry {
  private readonly plugins = new Map<string, LoadedPlugin>();

  register(loaded: LoadedPlugin): void {
    const name = loaded.manifest.name;
    if (this.plugins.has(name)) {
      throw new Error(`插件已注册：${name}`);
    }
    this.plugins.set(name, loaded);
  }

  unregister(name: string): boolean {
    return this.plugins.delete(name);
  }

  get(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  has(name: string): boolean {
    return this.plugins.has(name);
  }

  list(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  filterByProfile(profile: string): LoadedPlugin[] {
    return this.list().filter((p) => p.manifest.profile.includes(profile));
  }

  filterByCore(isCore: boolean): LoadedPlugin[] {
    return this.list().filter((p) => p.manifest.core === isCore);
  }

  clear(): void {
    this.plugins.clear();
  }

  size(): number {
    return this.plugins.size;
  }
}
