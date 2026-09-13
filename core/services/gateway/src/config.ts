import path from 'node:path';

import type { AppConfig } from '@apiscloud/libs';

import type { GatewayConfig, ProxiedService } from './types';

/**
 * 从环境变量加载 gateway 配置。
 * 所有字段都有默认值。
 */
export function loadGatewayConfig(_appConfig: AppConfig): GatewayConfig {
  return {
    port: readInt('GATEWAY_PORT', 9101),
    pluginProfile: process.env.GATEWAY_PROFILE ?? 'core',
    proxyPrefix: process.env.GATEWAY_PROXY_PREFIX ?? '/api/proxy',
    proxiedServices: loadProxiedServices(),
    pluginDirs: loadPluginDirs(),
    registryPath: process.env.GATEWAY_REGISTRY_PATH,
  };
}

function loadProxiedServices(): ProxiedService[] {
  return [
    {
      name: 'ingest',
      target: `http://localhost:${readInt('INGEST_PORT', 9103)}`,
    },
    {
      name: 'data-writer',
      target: `http://localhost:${readInt('DATA_WRITER_PORT', 9104)}`,
    },
    {
      name: 'dispatch-core',
      target: `http://localhost:${readInt('DISPATCH_CORE_PORT', 9105)}`,
    },
  ];
}

function loadPluginDirs(): string[] {
  const env = process.env.GATEWAY_PLUGIN_DIRS;
  if (env) {
    return env
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0)
      .map((d) => path.resolve(d));
  }

  // 默认：<cwd>/plugins 和 <cwd>/plugins/dispatch
  const root = process.cwd();
  return [path.join(root, 'plugins'), path.join(root, 'plugins', 'dispatch')];
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`环境变量 ${name} 必须是正整数，实际：${raw}`);
  }
  return n;
}
