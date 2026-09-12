import type { IncomingMessage, ServerResponse } from 'node:http';

import type { JwtContext, JwtPayload } from './jwt';

export interface AuthenticatedRequest extends IncomingMessage {
  user?: JwtPayload;
}

export interface AuthOptions {
  jwt: JwtContext;
  /** 跳过认证的路径前缀 */
  publicPaths?: string[];
  /** 从请求提取 token 的方式，默认从 Authorization: Bearer xxx */
  extractToken?: (req: IncomingMessage) => string | null;
}

export interface AuthResult {
  ok: boolean;
  user?: JwtPayload;
  error?: string;
}

/**
 * 默认 token 提取：从 Authorization: Bearer xxx。
 */
function defaultExtractToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth || typeof auth !== 'string') return null;
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

/**
 * 创建认证中间件。
 * 兼容原生 http，也兼容 Express 风格（(req, res, next)）。
 */
export function createAuthMiddleware(options: AuthOptions) {
  const { jwt, publicPaths = [], extractToken = defaultExtractToken } = options;

  /**
   * 校验请求的认证信息。
   */
  function authenticate(req: IncomingMessage): AuthResult {
    const url = req.url ?? '/';
    if (publicPaths.some((p) => url.startsWith(p))) {
      return { ok: true };
    }

    const token = extractToken(req);
    if (!token) {
      return { ok: false, error: '缺少认证 token' };
    }

    try {
      const user = jwt.verify(token);
      (req as AuthenticatedRequest).user = user;
      return { ok: true, user };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  /**
   * 原生 http 风格：返回 Boolean，调用方决定怎么响应。
   */
  function guard(req: IncomingMessage): AuthResult {
    return authenticate(req);
  }

  /**
   * Express 风格：中间件签名 (req, res, next)。
   */
  function expressMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ): void {
    const result = authenticate(req);
    if (!result.ok) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: result.error ?? '未认证' }));
      return;
    }
    next();
  }

  return {
    guard,
    expressMiddleware,
    authenticate,
  };
}

export type { JwtContext, JwtPayload };
