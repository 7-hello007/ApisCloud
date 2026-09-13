/**
 * 插件 HTTP 客户端。
 * 用全局 fetch，支持超时。
 */
export interface HttpClientOptions {
  timeoutMs?: number;
}

export interface HttpClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const timeoutMs = options.timeoutMs ?? 10_000;

  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
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
        const err = new Error(`HTTP ${res.status}`);
        (err as { status?: number }).status = res.status;
        (err as { body?: unknown }).body = body;
        throw err;
      }
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get<T>(url: string) {
      return request<T>(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
    },
    post<T>(url: string, data?: unknown) {
      return request<T>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: data ? JSON.stringify(data) : undefined,
      });
    },
  };
}
