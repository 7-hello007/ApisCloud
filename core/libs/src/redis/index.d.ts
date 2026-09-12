import { type Redis as RedisClient } from 'ioredis';
import type { AppConfig } from '../config';
import type { HealthCheckResult } from '../health';
export interface RedisWrapper {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSec?: number): Promise<void>;
    del(key: string): Promise<void>;
    hset(key: string, field: string, value: string): Promise<void>;
    hgetall(key: string): Promise<Record<string, string>>;
    hget(key: string, field: string): Promise<string | null>;
    publish(channel: string, message: string): Promise<void>;
    subscribe(channel: string, handler: (msg: string) => void): Promise<void>;
    health(): Promise<HealthCheckResult>;
    close(): Promise<void>;
    raw(): RedisClient;
}
export declare function createRedis(config: AppConfig): RedisWrapper;
//# sourceMappingURL=index.d.ts.map