/**
 * 统一 HTTP 客户端。
 * 所有请求打到 gateway，由 gateway 路由到具体服务。
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : path;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, `HTTP ${res.status}`, body);
  }

  return body as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'GET' });
  },
  post<T>(path: string, data?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  },
};

/**
 * 通过 gateway 反向代理到具体服务。
 * 例如：proxy('ingest', '/health') → /api/proxy/ingest/health
 */
export function proxyPath(service: string, path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `/api/proxy/${service}${cleanPath}`;
}

export function proxyGet<T>(service: string, path: string): Promise<T> {
  return api.get<T>(proxyPath(service, path));
}
