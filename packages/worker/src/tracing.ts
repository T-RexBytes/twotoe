import { redactText } from "@twotoe/core";
import type { SpanHandle, SpanValue, Tracer } from "@twotoe/writer";

// SPEC 11.4: Sentry AI agent tracing, opt-in only. Span ops and gen_ai.*
// attributes follow https://docs.sentry.io/platforms/javascript/guides/node/agent-tracing/manual-instrumentation/
// (checked 2026-10-22). The SDK is imported only when telemetry is on, it sends
// through the guarded fetch (so the egress ledger records it), and two scrub
// hooks drop anything that looks like a home path, an env key name or the canary.

export interface TelemetrySettings {
  dsn: string;
  content: boolean;                 // prompt/response text on spans (demo on fixtures only)
  environment: string;              // "demo" | "cli" | "nightly"
}

export interface Telemetry {
  tracer: Tracer;
  ingestHost: string;
  run<T>(name: string, fn: (traceId: string) => Promise<T>): Promise<T>;
  step<T>(op: string, name: string, fn: (span: SpanHandle) => Promise<T>): Promise<T>;
  flush(timeoutMs?: number): Promise<boolean>;
  close(): Promise<void>;
}

export function ingestHostOf(dsn: string): string {
  return new URL(dsn).hostname.toLowerCase();
}

const HOME_RE = /[A-Za-z]:\\{1,2}Users\\{1,2}|\/Users\/|\/home\//i;
const KEY_NAME_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;     // RAILWAY_TOKEN, OPENAI_API_KEY
const CANARY_RE = /TWOTOE_CANARY/;

export function unsafeValue(value: unknown): boolean {
  const s = typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value);
  return HOME_RE.test(s) || CANARY_RE.test(s) || KEY_NAME_RE.test(s.trim());
}

// Deletes attributes whose value is unsafe; returns how many were removed.
export function scrubAttributes(attrs: Record<string, unknown> | undefined): number {
  if (!attrs) return 0;
  let removed = 0;
  for (const [k, v] of Object.entries(attrs)) {
    if (unsafeValue(v)) {
      delete attrs[k];
      removed++;
    }
  }
  return removed;
}

interface SpanLike { data?: Record<string, unknown>; description?: string }
interface EventLike {
  spans?: SpanLike[];
  contexts?: { trace?: { data?: Record<string, unknown> }; [k: string]: unknown };
  server_name?: string;
  transaction?: string;
  extra?: Record<string, unknown>;
}

export function scrubSpan<T extends SpanLike>(span: T): T {
  scrubAttributes(span.data);
  if (span.description) span.description = redactText(span.description);
  return span;
}

// SDK 11 streams spans (gen_ai spans included) as standalone items; those reach
// beforeSendSpan as StreamedSpanJSON with `attributes` and `name`.
export function scrubStreamedSpan<T extends { attributes?: Record<string, unknown>; name: string }>(span: T): T {
  scrubAttributes(span.attributes);
  span.name = redactText(span.name);
  return span;
}

export function scrubEvent<T extends EventLike>(event: T): T {
  for (const s of event.spans ?? []) scrubSpan(s);
  scrubAttributes(event.contexts?.trace?.data);
  scrubAttributes(event.extra);
  event.server_name = "twotoe";
  for (const k of ["device", "os", "culture", "cloud_resource", "app"]) delete event.contexts?.[k];
  return event;
}

export async function startTelemetry(settings: TelemetrySettings): Promise<Telemetry> {
  const Sentry = await import("@sentry/node");
  // Transport over the global fetch: the egress guard allows only this DSN's
  // ingest host and records every envelope in the ledger.
  const transport = (options: Parameters<typeof Sentry.makeNodeTransport>[0]) =>
    Sentry.createTransport(options, async (request) => {
      const res = await fetch(options.url, {
        method: "POST",
        headers: { "content-type": "application/x-sentry-envelope" },
        body: request.body as RequestInit["body"],
      });
      return {
        statusCode: res.status,
        headers: { "x-sentry-rate-limits": res.headers.get("x-sentry-rate-limits"), "retry-after": res.headers.get("retry-after") },
      };
    });

  Sentry.init({
    dsn: settings.dsn,
    environment: settings.environment,
    release: "twotoe@0.0.0",
    serverName: "twotoe",
    // SDK 11 replaced `sendDefaultPii` (SPEC 11.4) with `dataCollection`, which
    // defaults to collecting everything. Turn every category off; AI inputs and
    // outputs only in demo content mode.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: settings.content, outputs: settings.content },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    tracesSampleRate: 1,
    defaultIntegrations: false,
    integrations: [],
    transport,
    // SDK 11 streams every span (root included) by default and ignores
    // beforeSendTransaction in that mode (it warns at init), so the SPEC 11.4
    // scrub runs here. scrubEvent stays for traceLifecycle "static".
    beforeSendSpan: (span) => scrubStreamedSpan(span),
  });

  const toHandle = (s: { setAttribute(k: string, v: SpanValue): unknown; setStatus(st: { code: number; message?: string }): unknown }): SpanHandle => ({
    set: (k, v) => { s.setAttribute(k, v); },
    fail: (message) => { s.setStatus({ code: 2, message }); },
  });

  const tracer: Tracer = {
    span: (op, name, attributes, fn) => Sentry.startSpan({ op, name, attributes }, (s) => fn(toHandle(s))),
  };

  return {
    tracer,
    ingestHost: ingestHostOf(settings.dsn),
    run: (name, fn) => Sentry.startSpan({ op: "twotoe.brief", name, forceTransaction: true, attributes: { "gen_ai.agent.name": "TwoToe" } }, (s) => fn(s.spanContext().traceId)),
    step: (op, name, fn) => Sentry.startSpan({ op, name }, (s) => fn(toHandle(s))),
    flush: (timeoutMs = 5000) => Sentry.flush(timeoutMs),
    close: async () => { await Sentry.close(2000); },
  };
}

const NOOP_HANDLE: SpanHandle = { set() {}, fail() {} };

// Telemetry off: same shape, nothing loaded, nothing sent.
export const NO_TELEMETRY: Omit<Telemetry, "ingestHost" | "tracer"> & { tracer: Tracer } = {
  tracer: { span: (_op, _name, _attrs, fn) => fn(NOOP_HANDLE) },
  run: (_name, fn) => fn(""),
  step: (_op, _name, fn) => fn(NOOP_HANDLE),
  flush: async () => true,
  close: async () => {},
};
