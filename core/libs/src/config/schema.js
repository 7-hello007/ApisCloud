"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchema = void 0;
const zod_1 = require("zod");
/**
 * 环境变量 Schema
 * 所有服务共用的配置契约，缺关键字段启动即失败。
 */
exports.ConfigSchema = zod_1.z.object({
    // 运行环境
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: zod_1.z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    SERVICE_NAME: zod_1.z.string().default('unknown'),
    LAYER: zod_1.z.string().default('single'),
    // 消息总线
    MESSAGE_BUS: zod_1.z.enum(['memory', 'mqtt', 'kafka']).default('memory'),
    // MQTT
    MQTT_URL: zod_1.z.string().default('mqtt://localhost:1883'),
    MQTT_USERNAME: zod_1.z.string().optional(),
    MQTT_PASSWORD: zod_1.z.string().optional(),
    // Kafka
    KAFKA_BROKERS: zod_1.z.string().default('localhost:9092'),
    KAFKA_CLIENT_ID: zod_1.z.string().default('apiscloud'),
    // PostgreSQL
    PG_HOST: zod_1.z.string().default('localhost'),
    PG_PORT: zod_1.z.coerce.number().int().positive().default(5432),
    PG_USER: zod_1.z.string().default('apiscloud'),
    PG_PASSWORD: zod_1.z.string().default('apiscloud'),
    PG_DATABASE: zod_1.z.string().default('apiscloud'),
    PG_POOL_MAX: zod_1.z.coerce.number().int().positive().default(10),
    // Redis
    REDIS_URL: zod_1.z.string().default('redis://localhost:6379'),
    // 可观测性
    PROMETHEUS_PORT: zod_1.z.coerce.number().int().positive().default(9090),
    // 安全
    JWT_SECRET: zod_1.z.string().min(8).default('change-me-in-production'),
});
//# sourceMappingURL=schema.js.map