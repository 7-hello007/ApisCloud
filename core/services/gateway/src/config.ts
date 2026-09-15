import path from 'node:path';

import type { AppConfig } from '@apiscloud/libs';

import type { GatewayConfig, ProxiedService } from './types';

export function loadGatewayConfig(_appConfig: AppConfig): GatewayConfig {
  return {
    port: readInt('GATEWAY_PORT', 9101),
    pluginProfile: process.env.GATEWAY_PROFILE ?? 'core',
    proxyPrefix: process.env.GATEWAY_PROXY_PREFIX ?? '/api/proxy',
    proxiedServices: loadProxiedServices(),
    pluginDirs: loadPluginDirs(),
    registryPath: process.env.GATEWAY_REGISTRY_PATH,

    // 认证
    authEnabled: readBool('GATEWAY_AUTH_ENABLED', false),
    jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
    authPublicPaths: loadAuthPublicPaths(),

    // 限流
    rateLimitEnabled: readBool('GATEWAY_RATE_LIMIT_ENABLED', true),
    rateLimitMax: readInt('GATEWAY_RATE_LIMIT_MAX', 100),
    rateLimitWindowSec: readInt('GATEWAY_RATE_LIMIT_WINDOW_SEC', 60),
  };
}

function loadProxiedServices(): ProxiedService[] {
  return [
    { name: 'ingest', target: `http://localhost:${readInt('INGEST_PORT', 9103)}` },
    { name: 'data-writer', target: `http://localhost:${readInt('DATA_WRITER_PORT', 9104)}` },
    { name: 'dispatch-core', target: `http://localhost:${readInt('DISPATCH_CORE_PORT', 9105)}` },
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
  const root = process.cwd();
  return [path.join(root, 'plugins'), path.join(root, 'plugins', 'dispatch')];
}

function loadAuthPublicPaths(): string[] {
  const env = process.env.GATEWAY_AUTH_PUBLIC_PATHS;
  if (env) {
    return env
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }
  return ['/health', '/metrics', '/api/registry'];
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

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}
