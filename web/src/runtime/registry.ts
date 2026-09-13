import type { ReactElement } from 'react';

/**
 * 前端插件契约。
 * 每个插件的前端模块默认导出这个结构。
 */
export interface NavItem {
  /** 分组名，用于 Sidebar 分组 */
  group: string;
  /** 显示标签 */
  label: string;
  /** 路由路径 */
  path: string;
  /** 可选图标名（Lucide 图标名，阶段四先用文本） */
  icon?: string;
  /** 组内排序，越小越靠前 */
  order?: number;
}

export interface PluginRoute {
  path: string;
  element: ReactElement;
}

export interface PluginFrontend {
  /** 插件名，必须与 plugin.json 的 name 一致 */
  name: string;
  /** 导航项 */
  navItems: NavItem[];
  /** 路由 */
  routes: PluginRoute[];
}

const registry = new Map<string, PluginFrontend>();

export function registerPluginFrontend(frontend: PluginFrontend): void {
  registry.set(frontend.name, frontend);
}

export function unregisterPluginFrontend(name: string): void {
  registry.delete(name);
}

export function clearRegistry(): void {
  registry.clear();
}

export function listPlugins(): PluginFrontend[] {
  return Array.from(registry.values());
}

/**
 * 返回按分组、组内顺序排列的导航项。
 */
export function getNavItems(): NavItem[] {
  const all = listPlugins().flatMap((f) => f.navItems);
  return all.sort((a, b) => {
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    return (a.order ?? 100) - (b.order ?? 100);
  });
}

/**
 * 返回所有路由。
 */
export function getRoutes(): PluginRoute[] {
  return listPlugins().flatMap((f) => f.routes);
}

/**
 * 按分组聚合导航项。
 */
export function getNavGroups(): Array<{ group: string; items: NavItem[] }> {
  const items = getNavItems();
  const groups = new Map<string, NavItem[]>();
  for (const item of items) {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group)!.push(item);
  }
  return Array.from(groups.entries()).map(([group, groupItems]) => ({
    group,
    items: groupItems,
  }));
}
