import path from 'node:path';

import { loadConfig, resetConfig } from '@apiscloud/libs';
import { loadGatewayConfig } from '@apiscloud/gateway';

describe('gateway.config', () => {
  const KEYS = [
    'GATEWAY_PORT',
    'GATEWAY_PROFILE',
    'GATEWAY_PROXY_PREFIX',
    'GATEWAY_PLUGIN_DIRS',
    'INGEST_PORT',
    'DATA_WRITER_PORT',
    'DISPATCH_CORE_PORT',
  ];

  const originalValues: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      originalValues[key] = process.env[key];
      delete process.env[key];
    }
    resetConfig();
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (originalValues[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValues[key];
      }
    }
  });

  it('默认端口 9101', () => {
    const config = loadGatewayConfig(loadConfig());
    expect(config.port).toBe(9101);
  });

  it('默认 profile 为 core', () => {
    const config = loadGatewayConfig(loadConfig());
    expect(config.pluginProfile).toBe('core');
  });

  it('默认代理前缀 /api/proxy', () => {
    const config = loadGatewayConfig(loadConfig());
    expect(config.proxyPrefix).toBe('/api/proxy');
  });

  it('默认被代理服务包含 ingest、data-writer、dispatch-core', () => {
    const config = loadGatewayConfig(loadConfig());
    const names = config.proxiedServices.map((s) => s.name).sort();
    expect(names).toEqual(['data-writer', 'dispatch-core', 'ingest']);
  });

  it('默认 pluginDirs 是 <cwd>/plugins 和 <cwd>/plugins/dispatch', () => {
    const config = loadGatewayConfig(loadConfig());
    expect(config.pluginDirs).toHaveLength(2);
    expect(config.pluginDirs[0]).toBe(path.join(process.cwd(), 'plugins'));
    expect(config.pluginDirs[1]).toBe(path.join(process.cwd(), 'plugins', 'dispatch'));
  });

  it('GATEWAY_PORT 覆盖端口', () => {
    process.env.GATEWAY_PORT = '9999';
    const config = loadGatewayConfig(loadConfig());
    expect(config.port).toBe(9999);
  });

  it('GATEWAY_PROFILE 覆盖 profile', () => {
    process.env.GATEWAY_PROFILE = 'full';
    const config = loadGatewayConfig(loadConfig());
    expect(config.pluginProfile).toBe('full');
  });

  it('GATEWAY_PROXY_PREFIX 覆盖代理前缀', () => {
    process.env.GATEWAY_PROXY_PREFIX = '/proxy';
    const config = loadGatewayConfig(loadConfig());
    expect(config.proxyPrefix).toBe('/proxy');
  });

  it('GATEWAY_PLUGIN_DIRS 覆盖目录（逗号分隔）', () => {
    process.env.GATEWAY_PLUGIN_DIRS = '/a,/b,/c';
    const config = loadGatewayConfig(loadConfig());
    expect(config.pluginDirs).toEqual([
      path.resolve('/a'),
      path.resolve('/b'),
      path.resolve('/c'),
    ]);
  });

  it('INGEST_PORT 影响代理目标', () => {
    process.env.INGEST_PORT = '9203';
    const config = loadGatewayConfig(loadConfig());
    const ingest = config.proxiedServices.find((s) => s.name === 'ingest');
    expect(ingest?.target).toBe('http://localhost:9203');
  });

  it('非法 GATEWAY_PORT 抛错', () => {
    process.env.GATEWAY_PORT = 'abc';
    expect(() => loadGatewayConfig(loadConfig())).toThrow(/GATEWAY_PORT/);
  });
});
