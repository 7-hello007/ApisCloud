export interface LogContext {
    trace_id?: string;
    span_id?: string;
    service?: string;
    plugin?: string;
    layer?: string;
    [key: string]: unknown;
}
export interface LoggerOptions {
    service: string;
    level?: string;
    layer?: string;
    pretty?: boolean;
}
//# sourceMappingURL=types.d.ts.map