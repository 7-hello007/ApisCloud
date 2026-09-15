export const INGEST_VERSION = '0.1.0';

// 服务
export { createIngestService } from './service';
export type { IngestService, IngestServiceOptions } from './service';

// 配置
export { loadIngestConfig } from './config';

// 校验
export { UplinkTelemetrySchema, DownlinkCommandSchema } from './validation';
export type { ValidatedTelemetry, ValidatedCommand } from './validation';

// 映射
export { telemetryToEnvelope, envelopeToCommand } from './mapper';

// MQTT
export { createMqttSubscriber } from './mqtt-subscriber';
export type { MqttSubscriber, MqttMessageHandler } from './mqtt-subscriber';
export { createMqttPublisher } from './mqtt-publisher';
export type { MqttPublisher } from './mqtt-publisher';

// 总线
export { createBusPublisher } from './bus-publisher';
export type { BusPublisher } from './bus-publisher';
export { createBusSubscriber } from './bus-subscriber';
export type { BusSubscriber, BusMessageHandler } from './bus-subscriber';

// 类型
export type { UplinkTelemetry, DownlinkCommand, IngestConfig } from './types';
