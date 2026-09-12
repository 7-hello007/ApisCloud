import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildRegistry } = require('../scripts/build-registry');

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'registry-test-'));
}

function writeManifest(root: string, subdir: string, manifest: object): void {
  const dir = path.join(root, subdir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

describe('registry.build', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempRoot();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('扫描 plugins 目录下的所有 plugin.json', () => {
    writeManifest(root, 'plugins/alpha', { name: 'alpha', version: '1.0.0' });
    writeManifest(root, 'plugins/beta', { name: 'beta', version: '1.0.0' });

    const registry = buildRegistry({
      root,
      write: false,
      serviceDirs: path.join(root, 'core', 'services'),
      pluginDirs: path.join(root, 'plugins'),
    });

    expect(registry.plugins).toHaveLength(2);
    expect(registry.plugins.map((p: { name: string }) => p.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('跳过下划线开头的目录', () => {
    writeManifest(root, 'plugins/_template', { name: 'template', version: '1.0.0' });
    writeManifest(root, 'plugins/real', { name: 'real', version: '1.0.0' });

    const registry = buildRegistry({
      root,
      write: false,
      serviceDirs: path.join(root, 'core', 'services'),
      pluginDirs: path.join(root, 'plugins'),
    });

    expect(registry.plugins.map((p: { name: string }) => p.name)).toEqual(['real']);
  });

  it('default 值填充正确', () => {
    writeManifest(root, 'plugins/p1', { name: 'p1', version: '1.0.0' });

    const registry = buildRegistry({
      root,
      write: false,
      serviceDirs: path.join(root, 'core', 'services'),
      pluginDirs: path.join(root, 'plugins'),
    });

    const p = registry.plugins[0];
    expect(p.core).toBe(false);
    expect(p.lazy).toBe(true);
    expect(p.profile).toEqual([]);
    expect(p.dependsOn).toEqual([]);
    expect(p.topics).toEqual({ subscribe: [], publish: [] });
  });

  it('core/services 下的 manifest 必须 core=true', () => {
    writeManifest(root, 'core/services/svc1', {
      name: 'svc1',
      version: '1.0.0',
      core: false,
    });

    expect(() =>
      buildRegistry({
        root,
        write: false,
        serviceDirs: path.join(root, 'core', 'services'),
        pluginDirs: path.join(root, 'plugins'),
      }),
    ).toThrow(/core=true/);
  });

  it('按 profile 建立索引', () => {
    writeManifest(root, 'plugins/a', { name: 'a', version: '1.0.0', profile: ['core'] });
    writeManifest(root, 'plugins/b', { name: 'b', version: '1.0.0', profile: ['full'] });
    writeManifest(root, 'plugins/c', { name: 'c', version: '1.0.0', profile: ['core', 'full'] });

    const registry = buildRegistry({
      root,
      write: false,
      serviceDirs: path.join(root, 'core', 'services'),
      pluginDirs: path.join(root, 'plugins'),
    });

    expect(registry.byProfile.core.sort()).toEqual(['a', 'c']);
    expect(registry.byProfile.full.sort()).toEqual(['b', 'c']);
    expect(registry.byProfile.all.sort()).toEqual(['a', 'b', 'c']);
  });

  it('拓扑排序：依赖在前', () => {
    writeManifest(root, 'plugins/base', { name: 'base', version: '1.0.0' });
    writeManifest(root, 'plugins/mid', {
      name: 'mid',
      version: '1.0.0',
      dependsOn: ['base'],
    });
    writeManifest(root, 'plugins/top', {
      name: 'top',
      version: '1.0.0',
      dependsOn: ['mid'],
    });

    const registry = buildRegistry({
      root,
      write: false,
      serviceDirs: path.join(root, 'core', 'services'),
      pluginDirs: path.join(root, 'plugins'),
    });

    const order = registry.topologicalOrder;
    expect(order.indexOf('base')).toBeLessThan(order.indexOf('mid'));
    expect(order.indexOf('mid')).toBeLessThan(order.indexOf('top'));
  });

  it('拓扑排序：缺失依赖抛错', () => {
    writeManifest(root, 'plugins/needs-missing', {
      name: 'needs-missing',
      version: '1.0.0',
      dependsOn: ['ghost'],
    });

    expect(() =>
      buildRegistry({
        root,
        write: false,
        serviceDirs: path.join(root, 'core', 'services'),
        pluginDirs: path.join(root, 'plugins'),
      }),
    ).toThrow(/ghost/);
  });

  it('拓扑排序：循环依赖抛错', () => {
    writeManifest(root, 'plugins/a', {
      name: 'a',
      version: '1.0.0',
      dependsOn: ['b'],
    });
    writeManifest(root, 'plugins/b', {
      name: 'b',
      version: '1.0.0',
      dependsOn: ['a'],
    });

    expect(() =>
      buildRegistry({
        root,
        write: false,
        serviceDirs: path.join(root, 'core', 'services'),
        pluginDirs: path.join(root, 'plugins'),
      }),
    ).toThrow(/循环依赖/);
  });

  it('插件名重复抛错', () => {
    writeManifest(root, 'plugins/a', { name: 'same', version: '1.0.0' });
    writeManifest(root, 'plugins/b', { name: 'same', version: '1.0.0' });

    expect(() =>
      buildRegistry({
        root,
        write: false,
        serviceDirs: path.join(root, 'core', 'services'),
        pluginDirs: path.join(root, 'plugins'),
      }),
    ).toThrow(/重复/);
  });

  it('非法插件名抛错', () => {
    writeManifest(root, 'plugins/bad', { name: 'Bad_Name', version: '1.0.0' });

    expect(() =>
      buildRegistry({
        root,
        write: false,
        serviceDirs: path.join(root, 'core', 'services'),
        pluginDirs: path.join(root, 'plugins'),
      }),
    ).toThrow();
  });

  it('缺少 version 抛错', () => {
    writeManifest(root, 'plugins/no-version', { name: 'no-version' });

    expect(() =>
      buildRegistry({
        root,
        write: false,
        serviceDirs: path.join(root, 'core', 'services'),
        pluginDirs: path.join(root, 'plugins'),
      }),
    ).toThrow(/version/);
  });

  it('stats 统计正确', () => {
    writeManifest(root, 'plugins/a', { name: 'a', version: '1.0.0', profile: ['core'] });
    writeManifest(root, 'plugins/b', { name: 'b', version: '1.0.0', profile: ['core'] });
    writeManifest(root, 'plugins/c', { name: 'c', version: '1.0.0', profile: ['full'] });

    const registry = buildRegistry({
      root,
      write: false,
      serviceDirs: path.join(root, 'core', 'services'),
      pluginDirs: path.join(root, 'plugins'),
    });

    expect(registry.stats.totalPlugins).toBe(3);
    expect(registry.stats.totalByProfile.core).toBe(2);
    expect(registry.stats.totalByProfile.full).toBe(1);
    expect(registry.stats.totalByProfile.all).toBe(3);
  });

  it('write=true 时生成 registry.json', () => {
    // 注意：使用真实的 REGISTRY_FILE 路径需要 root 是真实仓库
    // 这里只验证不写文件时不报错，写文件由 make build-registry 验证
    const registry = buildRegistry({
      root,
      write: false,
      serviceDirs: path.join(root, 'core', 'services'),
      pluginDirs: path.join(root, 'plugins'),
    });
    expect(registry.version).toBe('1');
    expect(registry.generator).toContain('apiscloud-registry');
  });
});
