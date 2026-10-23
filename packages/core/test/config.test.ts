import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { collectForConfig, defaultConfigPath, defaultRoots, expandHome, loadConfig, twotoeHome } from "../src/config";
import { KEV_FEED_URL, refreshKev } from "../src/pack/refreshKev";

const dirs: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "twotoe-cfg-")); dirs.push(d); return d; };
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
afterEach(() => vi.unstubAllGlobals());

describe("config (SPEC 12)", () => {
  it("paths live under ~/.twotoe", () => {
    expect(twotoeHome("H")).toBe(path.join("H", ".twotoe"));
    expect(defaultConfigPath("H")).toBe(path.join("H", ".twotoe", "config.json"));
  });

  it("missing file is an empty config; a BOM is tolerated; bad JSON or a wrong field throws", () => {
    const d = tmp();
    expect(loadConfig(path.join(d, "none.json"))).toEqual({});
    const f = path.join(d, "config.json");
    fs.writeFileSync(f, "﻿" + JSON.stringify({ roots: ["~/code"], region: "IN", extra: 1 }));
    expect(loadConfig(f)).toMatchObject({ roots: ["~/code"], region: "IN", extra: 1 });
    fs.writeFileSync(f, "{ nope");
    expect(() => loadConfig(f)).toThrow();
    fs.writeFileSync(f, JSON.stringify({ roots: "not-a-list" }));
    expect(() => loadConfig(f)).toThrow();
  });

  it("expandHome handles ~, ~/ and ~\\ only", () => {
    expect(expandHome("~", "H")).toBe(path.join("H", ""));
    expect(expandHome("~/code", "H")).toBe(path.join("H", "code"));
    expect(expandHome("~\\code", "H")).toBe(path.join("H", "code"));
    expect(expandHome("~other", "H")).toBe("~other");
  });

  it("default roots are the SPEC 8.3 folders that exist, nothing else", () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, "code"));
    fs.mkdirSync(path.join(home, "Documents", "GitHub"), { recursive: true });
    fs.mkdirSync(path.join(home, "Music"));
    expect(defaultRoots(home)).toEqual([path.join(home, "code"), path.join(home, "Documents", "GitHub")]);
  });

  it("collectForConfig resolves a relative config.fixture against the config folder", async () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, "fx", "project", "app"), { recursive: true });
    fs.writeFileSync(path.join(d, "fx", "probe.json"), JSON.stringify({ nodeVersion: "24.22.0" }));
    fs.writeFileSync(path.join(d, "fx", "project", "app", ".env"), "RAILWAY_TOKEN=TWOTOE_CANARY_9f3a\n");
    const r = await collectForConfig({ fixture: "fx" }, { configDir: d });
    expect(r.inventory.items).toContainEqual(expect.objectContaining({ kind: "runtime", name: "node", version: "24.22.0" }));
    expect(r.inventory.items).toContainEqual(expect.objectContaining({ kind: "envKey", key: "RAILWAY_TOKEN" }));
    expect(JSON.stringify(r)).not.toContain("TWOTOE_CANARY_9f3a");
  });
});

describe("refreshKev (SPEC 7.5)", () => {
  const NOW = new Date("2026-10-23T12:00:00Z");
  const feed = {
    catalogVersion: "2026.10.23",
    vulnerabilities: [
      { cveID: "CVE-2026-96652", vendorProject: "Plex", product: "Media Server", dateAdded: "2026-10-20", dueDate: "2026-11-03", shortDescription: "x" },
      { cveID: "CVE-2020-0001", vendorProject: "Old", product: "Thing", dateAdded: "2020-01-01", dueDate: "2020-02-01" },
    ],
  };

  it("fetches the feed, keeps the last 14 days, and stores a snapshot", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => { calls.push(url); return new Response(JSON.stringify(feed), { status: 200 }); });
    const snapshotPath = path.join(tmp(), "kev-snapshot.json");
    const r = await refreshKev({ now: NOW, snapshotPath });
    expect(calls).toEqual([KEV_FEED_URL]);
    expect(r).toMatchObject({ source: "network", catalogVersion: "2026.10.23" });
    expect(r.entries.map((e) => e.cveID)).toEqual(["CVE-2026-96652"]);
    const stored = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    expect(stored.vulnerabilities).toHaveLength(1);
    expect(stored.vulnerabilities[0]).not.toHaveProperty("shortDescription");
  });

  it("network failure falls back to the stored snapshot, then to the bundled one", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("blocked"); });
    const dir = tmp();
    const snapshotPath = path.join(dir, "kev-snapshot.json");
    expect(await refreshKev({ now: NOW, snapshotPath })).toMatchObject({ source: "bundled", catalogVersion: null });
    fs.writeFileSync(snapshotPath, JSON.stringify({ catalogVersion: "2026.10.21", fetchedAt: null, vulnerabilities: feed.vulnerabilities.map(({ shortDescription: _s, ...v }) => v) }));
    const r = await refreshKev({ now: NOW, snapshotPath });
    expect(r).toMatchObject({ source: "snapshot", catalogVersion: "2026.10.21" });
    expect(r.entries.map((e) => e.cveID)).toEqual(["CVE-2026-96652"]);
  });

  it("offline never calls fetch; a changed feed format is not trusted", async () => {
    let called = 0;
    vi.stubGlobal("fetch", async () => { called++; return new Response(JSON.stringify({ unexpected: true }), { status: 200 }); });
    const snapshotPath = path.join(tmp(), "kev-snapshot.json");
    expect((await refreshKev({ now: NOW, snapshotPath, offline: true })).source).toBe("bundled");
    expect(called).toBe(0);
    expect((await refreshKev({ now: NOW, snapshotPath })).source).toBe("bundled");
    expect(fs.existsSync(snapshotPath)).toBe(false);
  });
});
