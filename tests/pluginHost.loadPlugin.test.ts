import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadPlugin, readManifest, resolveEntry } from '@apiscloud/plugin-host';

describe('pluginHost.loadPlugin', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-host-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePlugin(
    manifest: object,
    source = 'module.exports = { async onLoad() {} };',
  ): string {
    const pluginDir = path.join(tmpDir, 'test-plugin');
    fs.mkdirSync(path.join(pluginDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    );
    fs.writeFileSync(path.join(pluginDir, 'src', 'index.js'), source, 'utf-8');
    return pluginDir;
  }

  it('读取合法 plugin.json', () => {
    const dir = writePlugin({
      name: 'test-plugin',
      version: '1.0.0',
    });
    const manifest = readManifest(dir);
    expect(manifest.name).toBe('test-plugin');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.core).toBe(false);
    expect(manifest.lazy).toBe(true);
    expect(manifest.profile).toEqual([]);
  });

  it('plugin.json 不存在抛错', () => {
    const emptyDir = fs.mkdtempSync(path.join(tmpDir, 'empty-'));
    expect(() => readManifest(emptyDir)).toThrow(/不存在/);
  });

  it('非法插件名抛错', () => {
    const dir = writePlugin({
      name: 'Invalid_Name',
      version: '1.0.0',
    });
    expect(() => readManifest(dir)).toThrow();
  });

  it('resolveEntry 找 src/index.js', () => {
    const dir = writePlugin({ name: 'test-plugin', version: '1.0.0' });
    const entry = resolveEntry(dir);
    expect(entry).toContain('index.js');
  });

  it('完整加载插件', () => {
    const dir = writePlugin(
      { name: 'test-plugin', version: '1.0.0', profile: ['core'] },
      'module.exports = { async onLoad() {}, getRoutes() { return []; } };',
    );
    const loaded = loadPlugin(dir);
    expect(loaded.manifest.name).toBe('test-plugin');
    expect(loaded.instance.onLoad).toBeDefined();
    expect(loaded.instance.getRoutes).toBeDefined();
    expect(loaded.loadedAt).toBeGreaterThan(0);
  });
});
