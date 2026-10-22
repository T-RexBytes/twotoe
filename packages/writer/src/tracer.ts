// A minimal tracing seam for the writer. The worker's Sentry tracing
// implements it; without telemetry the no-op tracer runs and nothing is sent.

export type SpanValue = string | number | boolean;

export interface SpanHandle {
  set(key: string, value: SpanValue): void;
  fail(message: string): void;
}

export interface Tracer {
  span<T>(op: string, name: string, attributes: Record<string, SpanValue>, fn: (span: SpanHandle) => Promise<T>): Promise<T>;
}

const NOOP_HANDLE: SpanHandle = { set() {}, fail() {} };

export const NOOP_TRACER: Tracer = {
  span: (_op, _name, _attributes, fn) => fn(NOOP_HANDLE),
};
