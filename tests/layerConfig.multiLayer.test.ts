import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadLayers, getLayer, getServices, getLayerNames, isServiceEnabled } from '@apiscloud/layer-config';

function writeTmpYaml(content: string): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-config-'));
  const file = path.join(dir, 'layers.yml');
  fs.writeFileSync(file, content, 'utf-8');
  return { dir, file };
}

describe('layerConfig.multiLayer', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('单层配置可加载', () => {
    const { dir, file } = writeTmpYaml(`
version: "1"
layers:
  - name: single
    services: [ingest, data-writer, dispatch-core]
`);
    tmpDir = dir;

    const config = loadLayers({ filePath: file });
    expect(config.layers).toHaveLength(1);
    expect(getLayerNames(config)).toEqual(['single']);
    expect(getServices(config, 'single')).toEqual([
      'ingest',
      'data-writer',
      'dispatch-core',
    ]);
  });

  it('三层配置可加载', () => {
    const { dir, file } = writeTmpYaml(`
version: "1"
layers:
  - name: access
    description: 接入层
    services: [ingest, data-writer, observability, registry]
  - name: processing
    description: 处理层
    services: [ingest, data-writer, dispatch-core, observability, registry]
  - name: decision
    description: 决策层
    services: [dispatch-core, observability, registry]
`);
    tmpDir = dir;

    const config = loadLayers({ filePath: file });
    expect(config.layers).toHaveLength(3);
    expect(getLayerNames(config)).toEqual(['access', 'processing', 'decision']);

    expect(getServices(config, 'access')).toContain('ingest');
    expect(getServices(config, 'access')).not.toContain('dispatch-core');

    expect(getServices(config, 'processing')).toContain('dispatch-core');

    expect(getServices(config, 'decision')).toEqual([
      'dispatch-core',
      'observability',
      'registry',
    ]);
  });

  it('三层配置中同一服务可在多层', () => {
    const { dir, file } = writeTmpYaml(`
version: "1"
layers:
  - name: access
    services: [ingest, data-writer]
  - name: processing
    services: [ingest, data-writer, dispatch-core]
  - name: decision
    services: [dispatch-core]
`);
    tmpDir = dir;

    const config = loadLayers({ filePath: file });
    // ingest 在 access 和 processing 中启用
    expect(isServiceEnabled(config, 'access', 'ingest')).toBe(true);
    expect(isServiceEnabled(config, 'processing', 'ingest')).toBe(true);
    expect(isServiceEnabled(config, 'decision', 'ingest')).toBe(false);
  });

  it('四层配置可加载（access/region/processing/decision）', () => {
    const { dir, file } = writeTmpYaml(`
version: "1"
layers:
  - name: access
    services: [ingest, observability, registry]
  - name: region
    services: [ingest, data-writer, observability, registry]
  - name: processing
    services: [ingest, data-writer, dispatch-core, observability, registry]
  - name: decision
    services: [dispatch-core, observability, registry]
`);
    tmpDir = dir;

    const config = loadLayers({ filePath: file });
    expect(config.layers).toHaveLength(4);
    expect(getLayerNames(config)).toEqual([
      'access',
      'region',
      'processing',
      'decision',
    ]);
  });

  it('加层只改配置，服务列表自动生效', () => {
    // 单层
    const { dir: d1, file: f1 } = writeTmpYaml(`
version: "1"
layers:
  - name: single
    services: [ingest, data-writer, dispatch-core, observability, registry]
`);
    const single = loadLayers({ filePath: f1 });
    expect(single.layers).toHaveLength(1);

    // 加一层，变成两层
    const { dir: d2, file: f2 } = writeTmpYaml(`
version: "1"
layers:
  - name: access
    services: [ingest, data-writer, observability, registry]
  - name: decision
    services: [dispatch-core, observability, registry]
`);
    const two = loadLayers({ filePath: f2 });
    expect(two.layers).toHaveLength(2);

    fs.rmSync(d1, { recursive: true, force: true });
    fs.rmSync(d2, { recursive: true, force: true });
  });

  it('层名重复抛错', () => {
    const { dir, file } = writeTmpYaml(`
version: "1"
layers:
  - name: access
    services: [ingest]
  - name: access
    services: [data-writer]
`);
    tmpDir = dir;
    expect(() => loadLayers({ filePath: file })).toThrow(/层名重复/);
  });

  it('未知服务名抛错', () => {
    const { dir, file } = writeTmpYaml(`
version: "1"
layers:
  - name: single
    services: [not-a-service]
`);
    tmpDir = dir;
    expect(() => loadLayers({ filePath: file })).toThrow();
  });

  it('非法层名抛错', () => {
    const { dir, file } = writeTmpYaml(`
version: "1"
layers:
  - name: Access_Layer
    services: [ingest]
`);
    tmpDir = dir;
    expect(() => loadLayers({ filePath: file })).toThrow();
  });

  it('getLayer 不存在的层抛错', () => {
    const { dir, file } = writeTmpYaml(`
version: "1"
layers:
  - name: single
    services: [ingest]
`);
    tmpDir = dir;
    const config = loadLayers({ filePath: file });
    expect(() => getLayer(config, 'not-exist')).toThrow(/层不存在/);
  });
});
