import type { Logger } from '@apiscloud/libs';

import { withTimeout } from './guard';
import type { LoadedPlugin, PluginContext } from './types';

export interface LifecycleOptions {
  loadTimeoutMs?: number;
  unloadTimeoutMs?: number;
}

/**
 * 插件生命周期管理：onLoad / onUnload。
 * 所有调用都带超时和异常保护，插件崩溃不影响宿主。
 */
export class LifecycleManager {
  private readonly loadTimeoutMs: number;
  private readonly unloadTimeoutMs: number;

  constructor(
    private readonly logger: Logger,
    options: LifecycleOptions = {},
  ) {
    this.loadTimeoutMs = options.loadTimeoutMs ?? 5000;
    this.unloadTimeoutMs = options.unloadTimeoutMs ?? 5000;
  }

  async load(plugin: LoadedPlugin, ctx: PluginContext): Promise<boolean> {
    const { manifest, instance } = plugin;
    if (!instance.onLoad) {
      return true;
    }

    const label = `plugin:${manifest.name}:onLoad`;
    try {
      await withTimeout(() => Promise.resolve(instance.onLoad!(ctx)), this.loadTimeoutMs, label);
      this.logger.debug({ plugin: manifest.name }, 'onLoad 成功');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ plugin: manifest.name, err: message }, 'onLoad 失败');
      return false;
    }
  }

  async unload(plugin: LoadedPlugin): Promise<boolean> {
    const { manifest, instance } = plugin;
    if (!instance.onUnload) {
      return true;
    }

    const label = `plugin:${manifest.name}:onUnload`;
    try {
      await withTimeout(() => Promise.resolve(instance.onUnload!()), this.unloadTimeoutMs, label);
      this.logger.debug({ plugin: manifest.name }, 'onUnload 成功');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ plugin: manifest.name, err: message }, 'onUnload 失败');
      return false;
    }
  }
}
