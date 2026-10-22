import fs from "node:fs";
import path from "node:path";
import { MockActivityEnvironment } from "@temporalio/testing";
import { Ledger, type Brief, type Finding } from "@twotoe/core";
import { describe, expect, it } from "vitest";
import { createActivities } from "../src/activities";
import { inputHash, readJournal, RunStore } from "../src/cache";
import { CachingModelClient } from "../src/cachingClient";
import { persistBrief } from "../src/persist";
import { kitchenSinkConfig, PromptEchoClient, tempDir } from "./helpers";

describe("RunStore and inputHash", () => {
  it("hashes inputs stably regardless of key order", () => {
    expect(inputHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(inputHash({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(inputHash({ a: 1 })).not.toBe(inputHash({ a: 2 }));
  });

  it("writes atomically, reads back, and journals", () => {
    const s = new RunStore(tempDir(), "twotoe-nightly-run-2026-10-23T03:00:00Z");
    expect(path.basename(s.dir)).toBe("twotoe-nightly-run-2026-10-23T03_00_00Z");
    expect(s.read("x", "k")).toBeUndefined();
    s.write("x", "k", { v: 1 });
    expect(s.read("x", "k")).toEqual({ v: 1 });
    expect(fs.readdirSync(s.dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    s.journal({ activity: "a", attempt: 1, event: "start" });
    expect(readJournal(s.dir).map((e) => e.event)).toEqual(["start"]);
  });
});

describe("CachingModelClient", () => {
  it("asks the model once per distinct request", async () => {
    const inner = new PromptEchoClient();
    const store = new RunStore(tempDir(), "wf");
    const req = { model: "m", system: "s", user: "FINDINGS (ordered by priority, already verified):\n[]\n\nFYI (awareness only, never actions):\n[]", schema: {} };
    const a = await new CachingModelClient(inner, store, "w", 1).chat(req);
    const b = await new CachingModelClient(inner, store, "w", 2).chat(req);
    await new CachingModelClient(inner, store, "w", 2).chat({ ...req, user: `${req.user} ` });
    expect(b).toEqual(a);
    expect(inner.calls).toBe(2);
    expect(store.events().map((e) => `${e.attempt}:${e.event}`)).toEqual([
      "1:model-call", "1:model-cached", "2:model-cache-hit", "2:model-call", "2:model-cached",
    ]);
  });
});

describe("activities are idempotent per workflow run", () => {
  it("a second call with the same input is a cache hit, not a second scan", async () => {
    const { configPath, stateDir } = kitchenSinkConfig();
    const acts = createActivities({ stateDir, modelClient: new PromptEchoClient(), ledger: new Ledger() });
    const info = { workflowExecution: { workflowId: "wf-idem", runId: "r1" } };
    const first = await new MockActivityEnvironment({ ...info, attempt: 1 }).run(acts.collectInventory, configPath);
    const second = await new MockActivityEnvironment({ ...info, attempt: 2 }).run(acts.collectInventory, configPath);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ region: "IN", notify: false });
    const events = readJournal(path.join(stateDir, "cache", "wf-idem")).map((e) => `${e.attempt}:${e.event}`);
    expect(events).toEqual(["1:start", "1:computed", "2:start", "2:cache-hit"]);
  });

  it("a different workflow run scans again", async () => {
    const { configPath, stateDir } = kitchenSinkConfig();
    const acts = createActivities({ stateDir, modelClient: new PromptEchoClient(), ledger: new Ledger() });
    await new MockActivityEnvironment({ workflowExecution: { workflowId: "night-1", runId: "a" } }).run(acts.collectInventory, configPath);
    await new MockActivityEnvironment({ workflowExecution: { workflowId: "night-2", runId: "b" } }).run(acts.collectInventory, configPath);
    expect(readJournal(path.join(stateDir, "cache", "night-2")).map((e) => e.event)).toEqual(["start", "computed"]);
  });
});

describe("persistBrief", () => {
  it("writes dated and latest files, redacted", () => {
    const dir = tempDir();
    const brief = {
      date: "2026-10-23", line1: "Nothing needs you today.", line2: "Everything else: you're fine.", checklist: [], fyi: [],
      meta: { mode: "template", model: null, attempts: 0, validatorRejections: [], durationMs: 1, egress: [] },
    } as Brief;
    const findings: Finding[] = [{ id: "x:1", advisoryId: "x", confidence: "likely", severity: "high", priority: 1, allowedTokens: [], evidence: [{ detector: "d", location: "C:\\Users\\alice\\code\\.env", detail: "K" }] }];
    const { latestPath } = persistBrief(dir, brief, findings);
    expect(JSON.parse(fs.readFileSync(latestPath, "utf8"))).toEqual(brief);
    expect(fs.existsSync(path.join(dir, "briefs", "2026-10-23.json"))).toBe(true);
    expect(fs.readFileSync(path.join(dir, "briefs", "latest.findings.json"), "utf8")).toContain("~\\\\code");
  });
});
