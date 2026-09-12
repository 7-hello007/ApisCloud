import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getLayerNames, getServices, loadLayers } from '@apiscloud/layer-config';

describe('layerConfig.addLayer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-config-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeLayers(content: string): string {
    const file = path.join(tmpDir, 'layers.yml');
    fs.writeFileSync(file, content, 'utf-8');
    return file;
  }

  it('加一层只需改配置', () => {
    const file = writeLayers(`
version: "1"
layers:
  - name: single
    services: [ingest, data-writer]
  - name: access
    services: [ingest, observability]
`);

    const config = loadLayers({ filePath: file });
    expect(getLayerNames(config)).toEqual(['single', 'access']);
    expect(getServices(config, 'access')).toEqual(['ingest', 'observability']);
  });

  it('三层配置可加载', () => {
    const file = writeLayers(`
version: "1"
layers:
  - name: access
    services: [ingest, data-writer, observability, registry]
  - name: processing
    services: [ingest, data-writer, dispatch-core, observability, registry]
  - name: decision
    services: [dispatch-core, observability, registry]
`);

    const config = loadLayers({ filePath: file });
    expect(getLayerNames(config)).toEqual(['access', 'processing', 'decision']);
    expect(getServices(config, 'decision')).toEqual(['dispatch-core', 'observability', 'registry']);
  });

  it('层名重复抛错', () => {
    const file = writeLayers(`
version: "1"
layers:
  - name: single
    services: [ingest]
  - name: single
    services: [data-writer]
`);

    expect(() => loadLayers({ filePath: file })).toThrow(/层名重复/);
  });

  it('未知服务名抛错', () => {
    const file = writeLayers(`
version: "1"
layers:
  - name: single
    services: [unknown-service]
`);

    expect(() => loadLayers({ filePath: file })).toThrow();
  });

  it('空服务列表抛错', () => {
    const file = writeLayers(`
version: "1"
layers:
  - name: single
    services: []
`);

    expect(() => loadLayers({ filePath: file })).toThrow();
  });

  it('空 layers 抛错', () => {
    const file = writeLayers(`
version: "1"
layers: []
`);

    expect(() => loadLayers({ filePath: file })).toThrow();
  });

  it('非法层名抛错', () => {
    const file = writeLayers(`
version: "1"
layers:
  - name: Invalid_Name
    services: [ingest]
`);

    expect(() => loadLayers({ filePath: file })).toThrow();
  });
});
