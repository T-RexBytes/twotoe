import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { Brief, Finding } from "@twotoe/core";
import { persistBrief } from "@twotoe/worker";
import { afterAll, describe, expect, it } from "vitest";
import { createCardServer, localCardData, resolveStatic } from "../src/commands/card";

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const temp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "twotoe-card-")); dirs.push(d); return d; };

const brief: Brief = {
  date: "2026-10-23", line1: "1 thing needs you today: bump Node to 24.22.1.", line2: "Everything else: you're fine.", checklist: [{ findingId: "nodejs-2026-10-21:abc", action: "Upgrade Node from 24.22.0 to 24.22.1", why: "Fixes." }],
  fyi: [], meta: { mode: "template", model: null, attempts: 0, validatorRejections: [], durationMs: 10, egress: [] },
};
const findings: Finding[] = [{ id: "nodejs-2026-10-21:abc", advisoryId: "nodejs-2026-10-21", confidence: "definite", severity: "high", priority: 170, allowedTokens: [], evidence: [{ detector: "runtimeVersion", location: "node --version", detail: "node 24.22.0 installed" }] }];

async function serve() {
  const dist = temp();
  fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>card</title>");
  fs.mkdirSync(path.join(dist, "assets"));
  fs.writeFileSync(path.join(dist, "assets", "a.js"), "console.log(1)");
  const stateDir = temp();
  const server = createCardServer({ dist, stateDir });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const { port, address } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, address, stateDir, dist, close: () => server.close() };
}

describe("twotoe card server", () => {
  it("serves the build with a same-origin CSP, and 404s brief.json until a brief is saved", async () => {
    const s = await serve();
    const index = await fetch(`${s.base}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toContain("text/html");
    expect(index.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(index.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await fetch(`${s.base}/assets/a.js`)).headers.get("content-type")).toContain("javascript");
    expect((await fetch(`${s.base}/brief.json`)).status).toBe(404);
    expect(s.address).toBe("127.0.0.1");
    s.close();
  });

  it("serves the saved brief as card data", async () => {
    const s = await serve();
    persistBrief(s.stateDir, brief, findings, { checksRun: 42, promptVersion: null, attempts: [] });
    const r = await fetch(`${s.base}/brief.json`);
    const data = await r.json() as { source: string; brief: Brief; advisories: Array<{ id: string; sourceUrls: string[] }>; checksRun: number };
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(data.source).toBe("local");
    expect(data.brief.line1).toBe(brief.line1);
    expect(data.checksRun).toBe(42);
    expect(data.advisories.map((a) => a.id)).toEqual(["nodejs-2026-10-21"]);
    expect(data.advisories[0]!.sourceUrls[0]).toContain("nodejs.org");
    s.close();
  });

  it("refuses other methods and paths outside the build", async () => {
    const s = await serve();
    expect((await fetch(`${s.base}/`, { method: "POST", body: "x" })).status).toBe(405);
    expect((await fetch(`${s.base}/..%2f..%2fpackage.json`)).status).toBe(404);
    expect((await fetch(`${s.base}/%E0%A4%A`)).status).toBe(404);
    s.close();
    expect(resolveStatic("C:\\dist", "/../secret.txt")).toBeNull();
    expect(resolveStatic("C:\\dist", "/%2e%2e/secret.txt")).toBeNull();
    expect(resolveStatic("C:\\dist", "/")).toBe(path.resolve("C:\\dist", "index.html"));
  });

  it("localCardData is null without a saved brief", () => {
    expect(localCardData(temp())).toBeNull();
  });
});
