import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EgressBlockedError, installEgressGuard } from "../src/egress/guard";
import { Ledger } from "../src/egress/ledger";

let uninstall: (() => void) | null = null;
afterEach(() => {
  uninstall?.();
  uninstall = null;
  vi.unstubAllGlobals();
});

function localServer(): Promise<{ url: string; received: () => string; close: () => void }> {
  let body = "";
  const server = http.createServer((req, res) => {
    req.on("data", (c) => { body += c; });
    req.on("end", () => res.end("ok"));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as AddressInfo;
    resolve({ url: `http://127.0.0.1:${port}/`, received: () => body, close: () => server.close() });
  }));
}

describe("egress guard (SPEC 15.1)", () => {
  it("blocks a non-allowlisted host before any request, and records nothing", async () => {
    const fake = vi.fn(async () => new Response("never"));
    vi.stubGlobal("fetch", fake);
    const ledger = new Ledger();
    uninstall = installEgressGuard({ ledger });
    await expect(fetch("https://example.com/upload", { method: "POST", body: "x" })).rejects.toBeInstanceOf(EgressBlockedError);
    await expect(fetch("http://127.0.0.1.nip.io/")).rejects.toThrow("egress blocked: 127.0.0.1.nip.io");
    expect(fake).not.toHaveBeenCalled();
    expect(ledger.entries()).toEqual([]);
  });

  it("records loopback requests with method and bytes out", async () => {
    const srv = await localServer();
    const ledger = new Ledger();
    uninstall = installEgressGuard({ ledger });
    const res = await fetch(srv.url, { method: "POST", body: "hello world" });
    expect(await res.text()).toBe("ok");
    srv.close();
    expect(ledger.entries()).toEqual([{ host: "127.0.0.1", method: "POST", bytesOut: 11 }]);
  });

  it("allows the KEV feed only when online", async () => {
    const fake = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fake);
    const online = new Ledger();
    uninstall = installEgressGuard({ ledger: online });
    await fetch("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json");
    expect(online.entries()).toEqual([{ host: "www.cisa.gov", method: "GET", bytesOut: 0 }]);
    uninstall();

    const offline = new Ledger();
    uninstall = installEgressGuard({ ledger: offline, offline: true });
    await expect(fetch("https://www.cisa.gov/x")).rejects.toBeInstanceOf(EgressBlockedError);
    expect(offline.nonLocal()).toEqual([]);
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("nested guards: the inner one can only narrow, both record, uninstall restores the outer one", async () => {
    const fake = vi.fn(async () => new Response(""));
    vi.stubGlobal("fetch", fake);
    const outer = new Ledger();
    const inner = new Ledger();
    const undoOuter = installEgressGuard({ ledger: outer, extraHosts: ["o1.ingest.sentry.io"] });
    const undoInner = installEgressGuard({ ledger: inner, offline: true });
    await expect(fetch("https://www.cisa.gov/x")).rejects.toBeInstanceOf(EgressBlockedError);       // inner is offline
    await expect(fetch("https://o1.ingest.sentry.io/e")).rejects.toBeInstanceOf(EgressBlockedError); // not in inner
    await fetch("http://127.0.0.1:9/x");
    expect(inner.entries()).toEqual([{ host: "127.0.0.1", method: "GET", bytesOut: 0 }]);
    expect(outer.entries()).toEqual([{ host: "127.0.0.1", method: "GET", bytesOut: 0 }]);
    undoInner();
    // The outer guard is still there, with its own allowlist and ledger.
    await expect(fetch("https://example.com/")).rejects.toBeInstanceOf(EgressBlockedError);
    await fetch("https://o1.ingest.sentry.io/e");
    expect(outer.entries().map((e) => e.host)).toEqual(["127.0.0.1", "o1.ingest.sentry.io"]);
    expect(inner.entries()).toHaveLength(1);
    undoOuter();
    await fetch("https://example.com/");   // fully uninstalled: the stub answers
    expect(fake).toHaveBeenCalledTimes(3);
  });

  it("out-of-order uninstall never leaves a still-installed guard without effect", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("")));
    const undoOuter = installEgressGuard({ ledger: new Ledger() });
    const inner = new Ledger();
    const undoInner = installEgressGuard({ ledger: inner, offline: true });
    undoOuter();                                  // outer first: inner must keep working
    await expect(fetch("https://www.cisa.gov/x")).rejects.toBeInstanceOf(EgressBlockedError);
    await fetch("http://127.0.0.1:9/x");
    expect(inner.entries()).toHaveLength(1);
    undoInner();
    await fetch("https://www.cisa.gov/x");        // both gone
  });

  it("allows an extra host (opted-in Sentry) and nothing else new", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("")));
    const ledger = new Ledger();
    uninstall = installEgressGuard({ ledger, extraHosts: ["o1.ingest.sentry.io"] });
    await fetch("https://o1.ingest.sentry.io/api/1/envelope/", { method: "POST", body: new Uint8Array(5) });
    await expect(fetch("https://o2.ingest.sentry.io/")).rejects.toBeInstanceOf(EgressBlockedError);
    expect(ledger.entries()).toEqual([{ host: "o1.ingest.sentry.io", method: "POST", bytesOut: 5 }]);
  });

  it("guards http.request/http.get and counts written bytes", async () => {
    const srv = await localServer();
    const ledger = new Ledger();
    uninstall = installEgressGuard({ ledger });
    expect(() => http.request("http://example.com/")).toThrow(EgressBlockedError);
    expect(() => http.get({ hostname: "example.org", path: "/" })).toThrow(EgressBlockedError);
    await new Promise<void>((resolve) => {
      const req = http.request(srv.url, { method: "PUT" }, (res) => { res.resume(); res.on("end", () => resolve()); });
      req.write("abc");
      req.end("de");
    });
    srv.close();
    expect(srv.received()).toBe("abcde");
    expect(ledger.entries()).toEqual([{ host: "127.0.0.1", method: "PUT", bytesOut: 5 }]);
  });

  it("guards raw sockets but lets local pipes through", () => {
    uninstall = installEgressGuard({ ledger: new Ledger() });
    expect(() => net.connect(443, "example.com")).toThrow(EgressBlockedError);
    expect(() => net.connect({ host: "8.8.8.8", port: 53 })).toThrow(EgressBlockedError);
    const pipe = net.connect({ path: process.platform === "win32" ? "\\\\.\\pipe\\twotoe-test-none" : "/tmp/twotoe-test-none.sock" });
    pipe.on("error", () => {});
    pipe.destroy();
  });

  it("uninstall restores the real functions", () => {
    const before = { fetch: globalThis.fetch, request: http.request, connect: net.connect };
    const undo = installEgressGuard({ ledger: new Ledger() });
    expect(globalThis.fetch).not.toBe(before.fetch);
    undo();
    expect(globalThis.fetch).toBe(before.fetch);
    expect(http.request).toBe(before.request);
    expect(net.connect).toBe(before.connect);
  });
});
