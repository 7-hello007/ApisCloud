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
  const res = await fetch(path, {
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

export function proxyGet<T>(service: string, path: string): Promise<T> {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return api.get<T>(`/api/proxy/${service}${cleanPath}`);
}

// ============================================================
// data-writer 查询响应类型
// 数值字段接受 number | string | null，兼容 pg NUMERIC
// ============================================================

export interface VehicleRow {
  vehicle_id: string;
  status: string;
  battery: number | string | null;
  lat: number | string | null;
  lng: number | string | null;
  heading: number | string | null;
  speed: number | string | null;
  updated_at: string | null;
}

export interface AlertRow {
  vehicle_id: string;
  alert_type: string;
  level: string;
  message: string;
  created_at: string;
}

export interface CommandRow {
  command_id: string;
  vehicle_id: string | null;
  task_id: string | null;
  command_type: string;
  status: string;
  issued_at: string;
}

export function fetchActiveVehicles(): Promise<{ count: number; vehicles: VehicleRow[] }> {
  return proxyGet('data-writer', '/api/query/vehicles/active');
}

export function fetchRecentAlerts(): Promise<{ count: number; alerts: AlertRow[] }> {
  return proxyGet('data-writer', '/api/query/alerts/recent');
}

export function fetchRecentCommands(): Promise<{ count: number; commands: CommandRow[] }> {
  return proxyGet('data-writer', '/api/query/commands/recent');
}
