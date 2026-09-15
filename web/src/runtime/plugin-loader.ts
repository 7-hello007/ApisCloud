import { registerPluginFrontend, type PluginFrontend } from './registry';

/**
 * 预扫描本地插件前端模块。
 * Vite 编译时展开成 { '/src/plugins/dashboard/index.tsx': () => import(...) }。
 */
const frontendModules = import.meta.glob<{ default: PluginFrontend }>('/src/plugins/*/index.tsx');

interface RegistryResponse {
  version: string;
  profile: string;
  proxiedServices: Array<{ name: string; prefix: string }>;
  plugins: Array<{
    name: string;
    version: string;
    core: boolean;
    profile: string[];
    lazy: boolean;
    topics: { subscribe: string[]; publish: string[] };
    frontend: string | null;
  }>;
  byProfile: Record<string, string[]>;
}

export interface LoadResult {
  loaded: string[];
  skipped: string[];
  failed: Array<{ name: string; error: string }>;
}

/**
 * 按插件名找到对应的前端模块路径。
 * 约定：web/src/plugins/<frontend>/index.tsx
 */
function findModulePath(frontendName: string): string | null {
  const key = `/src/plugins/${frontendName}/index.tsx`;
  return key in frontendModules ? key : null;
}

/**
 * 从 gateway 拉取插件清单，加载声明了 frontend 的插件前端模块。
 */
export async function loadPluginFrontends(profile: string): Promise<LoadResult> {
  const result: LoadResult = { loaded: [], skipped: [], failed: [] };

  let registry: RegistryResponse;
  try {
    const res = await fetch('/api/registry');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    registry = (await res.json()) as RegistryResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn('[plugin-loader] 无法拉取 /api/registry：', message);
    return result;
  }

  for (const plugin of registry.plugins) {
    if (!plugin.frontend) {
      result.skipped.push(plugin.name);
      continue;
    }

    if (!plugin.profile.includes(profile)) {
      result.skipped.push(plugin.name);
      continue;
    }

    const modulePath = findModulePath(plugin.frontend);
    if (!modulePath) {
      result.failed.push({
        name: plugin.name,
        error: `未找到前端模块 /src/plugins/${plugin.frontend}/index.tsx`,
      });
      continue;
    }

    try {
      const mod = await frontendModules[modulePath]();
      const frontend = mod.default;

      if (
        !frontend ||
        typeof frontend !== 'object' ||
        !frontend.name ||
        !Array.isArray(frontend.navItems) ||
        !Array.isArray(frontend.routes)
      ) {
        throw new Error('模块结构不合法');
      }

      registerPluginFrontend(frontend);
      result.loaded.push(plugin.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed.push({ name: plugin.name, error: message });
      // eslint-disable-next-line no-console
      console.warn(`[plugin-loader] 加载 ${plugin.name} 失败：`, message);
    }
  }

  return result;
}

/**
 * 拉取完整注册表，用于调试页。
 */
export async function fetchRegistry(): Promise<RegistryResponse | null> {
  try {
    const res = await fetch('/api/registry');
    if (!res.ok) return null;
    return (await res.json()) as RegistryResponse;
  } catch {
    return null;
  }
}
