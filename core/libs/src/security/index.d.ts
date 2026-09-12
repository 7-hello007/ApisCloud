import { z } from 'zod';
import type { AppConfig } from '../config';
export interface JwtPayload {
    sub: string;
    role?: string;
    [key: string]: unknown;
}
export interface SecurityContext {
    signJwt(payload: JwtPayload, expiresIn?: string): string;
    verifyJwt(token: string): JwtPayload;
    validate<T>(schema: z.ZodType<T>, data: unknown): T;
}
export declare function createSecurity(config: AppConfig): SecurityContext;
export { z };
//# sourceMappingURL=index.d.ts.map