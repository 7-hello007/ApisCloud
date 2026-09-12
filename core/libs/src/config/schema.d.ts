import { z } from 'zod';
/**
 * 环境变量 Schema
 * 所有服务共用的配置契约，缺关键字段启动即失败。
 */
export declare const ConfigSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        development: "development";
        test: "test";
        production: "production";
    }>>;
    LOG_LEVEL: z.ZodDefault<z.ZodEnum<{
        fatal: "fatal";
        error: "error";
        warn: "warn";
        info: "info";
        debug: "debug";
        trace: "trace";
        silent: "silent";
    }>>;
    SERVICE_NAME: z.ZodDefault<z.ZodString>;
    LAYER: z.ZodDefault<z.ZodString>;
    MESSAGE_BUS: z.ZodDefault<z.ZodEnum<{
        mqtt: "mqtt";
        memory: "memory";
        kafka: "kafka";
    }>>;
    MQTT_URL: z.ZodDefault<z.ZodString>;
    MQTT_USERNAME: z.ZodOptional<z.ZodString>;
    MQTT_PASSWORD: z.ZodOptional<z.ZodString>;
    KAFKA_BROKERS: z.ZodDefault<z.ZodString>;
    KAFKA_CLIENT_ID: z.ZodDefault<z.ZodString>;
    PG_HOST: z.ZodDefault<z.ZodString>;
    PG_PORT: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    PG_USER: z.ZodDefault<z.ZodString>;
    PG_PASSWORD: z.ZodDefault<z.ZodString>;
    PG_DATABASE: z.ZodDefault<z.ZodString>;
    PG_POOL_MAX: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    REDIS_URL: z.ZodDefault<z.ZodString>;
    PROMETHEUS_PORT: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    JWT_SECRET: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type AppConfig = z.infer<typeof ConfigSchema>;
//# sourceMappingURL=schema.d.ts.map