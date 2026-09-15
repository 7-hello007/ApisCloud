export interface Envelope<T = unknown> {
  id: string;
  topic: string;
  source: string;
  timestamp: number;
  trace_id: string;
  span_id: string;
  version: string;
  payload: T;
}
