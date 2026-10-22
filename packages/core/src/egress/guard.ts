import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { LOOPBACK_HOSTS, type EgressEntry, type Ledger } from "./ledger";

// SPEC 3 rule 4 and 15.1. Allowed: loopback, www.cisa.gov (KEV feed, unless
// offline), and extra hosts the caller passes (the Sentry host, only when
// telemetry is opted in). Everything else throws before any socket opens.

export const KEV_HOST = "www.cisa.gov";

export class EgressBlockedError extends Error {
  constructor(readonly host: string) {
    super(`egress blocked: ${host}`);
    this.name = "EgressBlockedError";
  }
}

export interface GuardOptions {
  ledger: Ledger;
  offline?: boolean;
  extraHosts?: string[];
}

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function bodyBytes(body: unknown): number {
  if (body == null) return 0;
  if (typeof body === "string") return Buffer.byteLength(body);
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (body instanceof URLSearchParams) return Buffer.byteLength(body.toString());
  return 0; // streams and FormData: size unknown up front
}

let installed: (() => void) | null = null;

// Installs the guard process-wide and returns an uninstall function.
// Installing twice replaces the previous guard.
export function installEgressGuard(opts: GuardOptions): () => void {
  installed?.();
  const allow = new Set([...LOOPBACK_HOSTS]);
  if (!opts.offline) allow.add(KEV_HOST);
  for (const h of opts.extraHosts ?? []) allow.add(normalizeHost(h));
  const check = (rawHost: string) => {
    const host = normalizeHost(rawHost);
    if (!allow.has(host)) throw new EgressBlockedError(host);
    return host;
  };

  // ---- fetch (Ollama client, KEV refresh) ----
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const host = check(new URL(href).hostname);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const declared = input instanceof Request ? Number(input.headers.get("content-length") ?? 0) : 0;
    opts.ledger.record({ host, method, bytesOut: init?.body !== undefined ? bodyBytes(init.body) : declared });
    return realFetch(input, init);
  }) as typeof fetch;

  // ---- http/https request + get (SDKs that do not use fetch) ----
  const wrapRequest = (mod: typeof http | typeof https) => {
    const realRequest = mod.request;
    const realGet = mod.get;
    const hostOf = (args: unknown[]): { host: string; method: string } => {
      const [a, b] = args;
      let host = "localhost";
      let method = "GET";
      if (typeof a === "string" || a instanceof URL) host = new URL(String(a)).hostname;
      const o = (typeof a === "object" && !(a instanceof URL) ? a : typeof b === "object" && typeof b !== "function" ? b : undefined) as http.RequestOptions | undefined;
      if (o) {
        if (o.hostname) host = o.hostname;
        else if (o.host) host = o.host.replace(/:\d+$/, "");
        if (o.method) method = o.method.toUpperCase();
      }
      return { host, method };
    };
    const guarded = (real: typeof http.request) => ((...args: unknown[]) => {
      const { host: raw, method } = hostOf(args);
      const host = check(raw);
      const entry: EgressEntry = opts.ledger.record({ host, method, bytesOut: 0 });
      const req = (real as (...a: unknown[]) => http.ClientRequest)(...args);
      const write = req.write.bind(req);
      const end = req.end.bind(req);
      req.write = ((chunk: unknown, ...rest: unknown[]) => {
        entry.bytesOut += bodyBytes(chunk);
        return (write as (...a: unknown[]) => boolean)(chunk, ...rest);
      }) as typeof req.write;
      req.end = ((chunk?: unknown, ...rest: unknown[]) => {
        if (chunk && typeof chunk !== "function") entry.bytesOut += bodyBytes(chunk);
        return (end as (...a: unknown[]) => http.ClientRequest)(chunk, ...rest);
      }) as typeof req.end;
      return req;
    }) as typeof http.request;
    mod.request = guarded(realRequest);
    mod.get = guarded(realGet as typeof http.request) as typeof http.get;
    return () => { mod.request = realRequest; mod.get = realGet; };
  };
  const undoHttp = wrapRequest(http);
  const undoHttps = wrapRequest(https);

  // ---- raw sockets: check only (fetch/http above already recorded) ----
  const connectHost = (args: unknown[]): string | null => {
    const [a, b] = args;
    if (typeof a === "object" && a !== null) {
      const o = a as { path?: string; host?: string };
      if (o.path) return null;                 // local IPC pipe
      return o.host ?? "localhost";
    }
    if (typeof a === "string" && !/^\d+$/.test(a)) return null;   // pipe path
    return typeof b === "string" ? b : "localhost";
  };
  const realNetConnect = net.connect;
  const realNetCreate = net.createConnection;
  const realTlsConnect = tls.connect;
  const guardSocket = <T extends (...a: never[]) => unknown>(real: T): T => ((...args: unknown[]) => {
    const host = connectHost(args);
    if (host !== null) check(host);
    return (real as unknown as (...a: unknown[]) => unknown)(...args);
  }) as unknown as T;
  net.connect = guardSocket(realNetConnect);
  net.createConnection = guardSocket(realNetCreate);
  tls.connect = guardSocket(realTlsConnect);

  const uninstall = () => {
    globalThis.fetch = realFetch;
    undoHttp();
    undoHttps();
    net.connect = realNetConnect;
    net.createConnection = realNetCreate;
    tls.connect = realTlsConnect;
    if (installed === uninstall) installed = null;
  };
  installed = uninstall;
  return uninstall;
}
