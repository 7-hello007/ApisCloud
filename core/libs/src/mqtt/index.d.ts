import { type MqttClient } from 'mqtt';
import type { AppConfig } from '../config';
import type { HealthCheckResult } from '../health';
export interface MqttWrapper {
    publish(topic: string, payload: unknown, qos?: 0 | 1 | 2): Promise<void>;
    subscribe(topic: string, handler: (topic: string, payload: Buffer) => void, qos?: 0 | 1 | 2): Promise<void>;
    health(): Promise<HealthCheckResult>;
    close(): Promise<void>;
    raw(): MqttClient;
}
export declare function createMqtt(config: AppConfig): MqttWrapper;
//# sourceMappingURL=index.d.ts.map