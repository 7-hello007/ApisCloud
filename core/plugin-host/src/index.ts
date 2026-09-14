export const PLUGIN_HOST_VERSION = '0.1.0';

// types
export type {
  Plugin,
  PluginContext,
  PluginManifest,
  LoadedPlugin,
  Route,
  PluginHealth,
  TopicFilter,
  ServiceUrls,
  PluginMetrics,
} from './types';

// schema
export { PluginManifestSchema } from './schema';
export type { PluginManifestInput } from './schema';

// guard
export { withTimeout, safeCall } from './guard';
export type { SafeResult } from './guard';

// http-client
export { createHttpClient } from './http-client';
export type { HttpClient, HttpClientOptions } from './http-client';

// loader
export {
  loadPlugin,
  readManifest,
  resolveEntry,
  loadPluginInstance,
} from './loader';

// registry
export { PluginRegistry } from './registry';

// lifecycle
export { LifecycleManager } from './lifecycle';
export type { LifecycleOptions } from './lifecycle';

// host
export { PluginHost } from './host';
export type { PluginHostOptions, LoadAllResult } from './host';
