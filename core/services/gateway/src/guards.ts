import type { IncomingMessage, ServerResponse } from 'node:http';

import { createAuthMiddleware, createJwt, createRateLimiter, type Logger } from '@apiscloud/libs';

export interface GuardContext {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  method: string;
}

export type RequestGuard = (ctx: GuardContext) => Promise<boolean> | boolean;

export interface AuthGuardOptions {
  enabled: boolean;
  jwtSecret: string;
  publicPaths: string[];
  logger: Logger;
}

/**
 * JWT 认证 guard。
 * 未启用时直接通过。
 * 白名单路径直接通过。
 * 其他路径需要 Authorization: Bearer <token>。
 */
export function createAuthGuard(options: AuthGuardOptions): RequestGuard {
  const jwt = createJwt({ secret: options.jwtSecret });
  const auth = createAuthMiddleware({
    jwt,
    publicPaths: options.publicPaths,
  });

  return (ctx) => {
    if (!options.enabled) return true;

    // 白名单前缀匹配
    for (const prefix of options.publicPaths) {
      if (ctx.pathname === prefix || ctx.pathname.startsWith(`${prefix}/`)) {
        return true;
      }
    }

    const result = auth.guard(ctx.req as never) as
      { ok: true } | { ok: false; status?: number; reason?: string };

    if (result.ok) return true;

    ctx.res.writeHead(result.status ?? 401, { 'Content-Type': 'application/json' });
    ctx.res.end(
      JSON.stringify({
        error: 'unauthorized',
        reason: result.reason ?? 'missing or invalid token',
      }),
    );
    options.logger.warn({ path: ctx.pathname, reason: result.reason }, '认证失败');
    return false;
  };
}

export interface RateLimitGuardOptions {
  enabled: boolean;
  maxRequests: number;
  windowSec: number;
  /** 白名单路径（不过限流） */
  exemptPaths: string[];
  logger: Logger;
}

/**
 * 每 IP 限流 guard。
 * 内存版，单进程有效。多实例部署需替换为 Redis 版。
 */
export function createRateLimitGuard(options: RateLimitGuardOptions): RequestGuard {
  const limiter = createRateLimiter({
    maxRequests: options.maxRequests,
    windowSec: options.windowSec,
  });

  return (ctx) => {
    if (!options.enabled) return true;

    for (const prefix of options.exemptPaths) {
      if (ctx.pathname === prefix || ctx.pathname.startsWith(`${prefix}/`)) {
        return true;
      }
    }

    const ip = getClientIp(ctx.req);
    const result = limiter.tryConsume(`ip:${ip}`);

    // 写入限流头
    ctx.res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
    ctx.res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    ctx.res.setHeader('X-RateLimit-Reset', String(Math.floor(result.resetAt / 1000)));

    if (result.allowed) return true;

    ctx.res.writeHead(429, { 'Content-Type': 'application/json' });
    ctx.res.end(
      JSON.stringify({
        error: 'too_many_requests',
        retry_after_sec: Math.ceil((result.resetAt - Date.now()) / 1000),
      }),
    );
    options.logger.warn({ path: ctx.pathname, ip }, '限流触发');
    return false;
  };
}

function getClientIp(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}
