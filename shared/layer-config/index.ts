export const LAYER_CONFIG_VERSION = '0.1.0';

// schema
export {
  LayersConfigSchema,
  KNOWN_SERVICES,
} from './schema';
export type { LayersConfig, Layer, KnownService } from './schema';

// loader
export {
  loadLayers,
  getLayer,
  getServices,
  getLayerNames,
  isServiceEnabled,
} from './loader';
export type { LayerLoaderOptions } from './loader';
