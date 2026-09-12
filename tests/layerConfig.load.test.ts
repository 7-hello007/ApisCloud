import path from 'node:path';

import {
  getLayer,
  getLayerNames,
  getServices,
  isServiceEnabled,
  KNOWN_SERVICES,
  loadLayers,
} from '@apiscloud/layer-config';

describe('layerConfig.load', () => {
  const layersFile = path.resolve(__dirname, '..', 'shared', 'layer-config', 'layers.yml');

  it('能加载 layers.yml', () => {
    const config = loadLayers({ filePath: layersFile });
    expect(config.version).toBe('1');
    expect(config.layers.length).toBeGreaterThan(0);
  });

  it('当前只有一层 single', () => {
    const config = loadLayers({ filePath: layersFile });
    expect(getLayerNames(config)).toEqual(['single']);
  });

  it('single 层包含 10 个核心服务', () => {
    const config = loadLayers({ filePath: layersFile });
    const services = getServices(config, 'single');
    expect(services).toHaveLength(10);
    for (const s of KNOWN_SERVICES) {
      expect(services).toContain(s);
    }
  });

  it('isServiceEnabled 判断正确', () => {
    const config = loadLayers({ filePath: layersFile });
    expect(isServiceEnabled(config, 'single', 'ingest')).toBe(true);
    expect(isServiceEnabled(config, 'single', 'simulator')).toBe(true);
    expect(isServiceEnabled(config, 'single', 'unknown-svc')).toBe(false);
  });

  it('getLayer 不存在时抛错', () => {
    const config = loadLayers({ filePath: layersFile });
    expect(() => getLayer(config, 'unknown-layer')).toThrow();
  });

  it('getServices 不存在时抛错', () => {
    const config = loadLayers({ filePath: layersFile });
    expect(() => getServices(config, 'unknown-layer')).toThrow();
  });

  it('文件不存在抛错', () => {
    expect(() => loadLayers({ filePath: '/nonexistent/layers.yml' })).toThrow();
  });
});
