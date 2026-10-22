import fs from "node:fs";
import path from "node:path";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { Ledger } from "@twotoe/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createActivities } from "../src/activities";
import { readJournal } from "../src/cache";
import { ensureSchedule, removeSchedule, SCHEDULE_ID } from "../src/schedule";
import { WORKFLOWS_PATH } from "../src/worker";
import type { NightlyResult } from "../src/workflows";
import { CANARY, kitchenSinkConfig, PromptEchoClient, temporalExeOrNull } from "./helpers";

// SPEC 15: Temporal TestWorkflowEnvironment happy path + activity failure retry.
// Uses the installed Temporal CLI when present; otherwise the SDK downloads its dev server.

let env: TestWorkflowEnvironment;
beforeAll(async () => {
  const exe = temporalExeOrNull();
  env = await TestWorkflowEnvironment.createLocal(exe ? { server: { executable: { type: "existing-path", path: exe } } } : {});
}, 120_000);
afterAll(async () => {
  await env?.teardown();
});

async function runNightly(opts: { failFirstModelAttempt?: boolean } = {}) {
  const { configPath, stateDir } = kitchenSinkConfig();
  const model = new PromptEchoClient();
  const taskQueue = `test-${Math.random().toString(36).slice(2)}`;
  const worker = await Worker.create({
    connection: env.nativeConnection,
    taskQueue,
    workflowsPath: WORKFLOWS_PATH,
    activities: createActivities({ stateDir, modelClient: model, ledger: new Ledger(), ...opts }),
  });
  const workflowId = `nightly-${taskQueue}`;
  const result = await worker.runUntil(env.client.workflow.execute("nightlyTriage", {
    taskQueue, workflowId, args: [{ configPath, offline: true }],
  })) as NightlyResult;
  const history = await env.client.workflow.getHandle(workflowId).fetchHistory();
  return { result, stateDir, model, workflowId, history, journal: readJournal(path.join(stateDir, "cache", workflowId)) };
}

// activityType name -> attempts reported by ActivityTaskStarted events.
function startedAttempts(history: Awaited<ReturnType<typeof runNightly>>["history"]): Record<string, number[]> {
  const types = new Map<string, string>();
  const out: Record<string, number[]> = {};
  for (const e of history.events ?? []) {
    const s = e.activityTaskScheduledEventAttributes;
    if (s) types.set(String(e.eventId), s.activityType?.name ?? "?");
    const st = e.activityTaskStartedEventAttributes;
    if (st) {
      const name = types.get(String(st.scheduledEventId)) ?? "?";
      (out[name] ??= []).push(st.attempt ?? 1);
    }
  }
  return out;
}

describe("nightlyTriage workflow", () => {
  it("happy path: scan, match, write, assemble, persist", async () => {
    const r = await runNightly();
    expect(r.result).toMatchObject({ actions: 4, mode: "llm" });
    expect(r.model.calls).toBe(1);
    const latest = JSON.parse(fs.readFileSync(path.join(r.stateDir, "briefs", "latest.json"), "utf8")) as { line1: string; fyi: string[]; meta: { mode: string } };
    expect(latest.line1).toMatch(/^4 things need you today: /);
    expect(latest.fyi).toHaveLength(1);
    expect(latest.meta.mode).toBe("llm");
    expect(Object.keys(startedAttempts(r.history)).sort()).toEqual([
      "assembleBrief", "collectInventory", "loadPack", "matchAdvisories", "persistAndNotify", "writeBriefWithValidation",
    ]);
    // Nothing the activities wrote (cache, journal, briefs) contains the canary.
    const files = fs.readdirSync(r.stateDir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile());
    for (const f of files) expect(fs.readFileSync(path.join(f.parentPath, f.name), "utf8")).not.toContain(CANARY);
    // The workflow history carries refs and findings, not the inventory.
    expect(JSON.stringify(r.history)).not.toContain("RAILWAY_TOKEN\",\"file");
  }, 120_000);

  it("activity failure: retried, finished model response reused, nothing computed twice", async () => {
    const r = await runNightly({ failFirstModelAttempt: true });
    expect(r.result.mode).toBe("llm");
    expect(startedAttempts(r.history).writeBriefWithValidation).toEqual([2]);
    const count = (activity: string, event: string) => r.journal.filter((e) => e.activity === activity && e.event === event).length;
    expect(count("writeBriefWithValidation", "injected-failure")).toBe(1);
    expect(count("writeBriefWithValidation", "model-call")).toBe(1);
    expect(count("writeBriefWithValidation", "model-cache-hit")).toBe(1);
    expect(r.model.calls).toBe(1);
    for (const a of ["collectInventory", "loadPack", "matchAdvisories", "writeBriefWithValidation", "assembleBrief", "persistAndNotify"]) {
      expect(count(a, "computed")).toBe(1);
    }
  }, 120_000);
});

describe("nightly schedule (SPEC 11.3)", () => {
  it("creates, updates in place, and removes the schedule", async () => {
    const opts = { configPath: "C:\\cfg\\config.json", at: "03:00", timezone: "Asia/Kolkata" };
    expect(await ensureSchedule(env.client, opts)).toBe("created");
    expect(await ensureSchedule(env.client, { ...opts, at: "04:30" })).toBe("updated");
    const d = await env.client.schedule.getHandle(SCHEDULE_ID).describe();
    expect(d.spec.timezone).toBe("Asia/Kolkata");
    expect(JSON.stringify(d.spec.calendars)).toContain("\"start\":4");
    expect(JSON.stringify(d.spec.calendars)).toContain("\"start\":30");
    expect(d.policies.catchupWindow).toBe(6 * 60 * 60 * 1000);
    expect(d.policies.overlap).toBe("SKIP");
    expect(d.action).toMatchObject({ type: "startWorkflow", workflowType: "nightlyTriage", taskQueue: "twotoe" });
    expect(await removeSchedule(env.client)).toBe(true);
    expect(await removeSchedule(env.client)).toBe(false);
  }, 60_000);
});
