export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  checks: Record<string, { status: string; message?: string }>;
}