import { z } from 'zod';

/**
 * 环境变量 Schema
 * 所有服务共用的配置契约，缺关键字段启动即失败。
 */
export const ConfigSchema = z.object({
  // 运行环境
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SERVICE_NAME: z.string().default('unknown'),
  LAYER: z.string().default('single'),

  // 消息总线
  MESSAGE_BUS: z.enum(['memory', 'mqtt', 'kafka']).default('memory'),

  // MQTT
  MQTT_URL: z.string().default('mqtt://localhost:1883'),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),

  // Kafka
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('apiscloud'),

  // PostgreSQL
  PG_HOST: z.string().default('localhost'),
  PG_PORT: z.coerce.number().int().positive().default(5432),
  PG_USER: z.string().default('apiscloud'),
  PG_PASSWORD: z.string().default('apiscloud'),
  PG_DATABASE: z.string().default('apiscloud'),
  PG_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // 可观测性
  PROMETHEUS_PORT: z.coerce.number().int().positive().default(9090),

  // 安全
  JWT_SECRET: z.string().min(8).default('change-me-in-production'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
