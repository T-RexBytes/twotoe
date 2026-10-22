// SPEC 11.3 crash test. Run: pnpm tsx packages/worker/scripts/crash-test.ts [--keep-server]
//   1. start (or reuse) a Temporal dev server and a worker with a 20 s delay injected
//      inside the model activity, after the model has answered
//   2. start nightlyTriage on a synthetic kitchen-sink fixture
//   3. 8 s into that delay, hard-kill the worker tree (taskkill /T /F on Windows)
//   4. restart the worker, wait for the workflow to finish
//   5. read the history (`temporal workflow show`) and the activity journal, print the summary
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Connection } from "@temporalio/client";
import { redactText, runFile, systemExe } from "@twotoe/core";
import { readJournal, type JournalEvent } from "../src/cache";
import { devServerArgs, findTemporalExe, isPortOpen, TEMPORAL_UI } from "../src/temporal";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLI = path.join(REPO, "packages", "cli", "src", "index.ts");
const CANARY = "TWOTOE_CANARY_9f3a";
const DELAY_MS = 20_000;
const KILL_AFTER_MS = 8_000;
const TASK_QUEUE = "twotoe-crash-test";
const keepServer = process.argv.includes("--keep-server");

const log = (s: string) => process.stdout.write(redactText(`[crash-test] ${s}\n`));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(what: string, check: () => boolean | Promise<boolean>, timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function writeFixture(dir: string): string {
  const files: Record<string, string> = {
    "fixture/probe.json": JSON.stringify({ nodeVersion: "24.22.0", plexVersion: "1.43.3.10860" }),
    "fixture/project/ai/.venv/Lib/site-packages/litellm-1.107.0.dist-info/METADATA": "Name: litellm\n",
    "fixture/project/ai/.env": `SECRET_VALUE=${CANARY}\n`,
    "fixture/project/rail/.env": `RAILWAY_TOKEN=${CANARY}\nSECRET_VALUE=${CANARY}\n`,
    "fixture/project/rail/railway.toml": "[build]\n",
    "config.json": JSON.stringify({ fixture: "fixture", region: "IN" }),
  };
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return path.join(dir, "config.json");
}

function startWorker(stateDir: string, name: string, extra: string[]): { child: ChildProcess; logPath: string } {
  const logPath = path.join(stateDir, "logs", `${name}.log`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const fd = fs.openSync(logPath, "w");
  const child = spawn(process.execPath, ["--import", "tsx", CLI, "worker", "--task-queue", TASK_QUEUE, "--state-dir", stateDir, ...extra], {
    cwd: REPO, stdio: ["ignore", fd, fd], windowsHide: true,
  });
  return { child, logPath };
}

async function killTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    const taskkill = systemExe("taskkill.exe") ?? "taskkill.exe";
    await runFile(taskkill, ["/PID", String(pid), "/T", "/F"]);
  } else {
    process.kill(pid, "SIGKILL");
  }
}

interface HistoryEvent {
  eventId: string;
  eventTime: string;
  eventType: string;
  activityTaskScheduledEventAttributes?: { activityType?: { name?: string } };
  activityTaskStartedEventAttributes?: { scheduledEventId?: string; attempt?: number };
  activityTaskCompletedEventAttributes?: { scheduledEventId?: string };
}

const isType = (e: HistoryEvent, t: string) => e.eventType === t || e.eventType === `EVENT_TYPE_${t.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;

async function main(): Promise<number> {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "twotoe-crash-"));
  const configPath = writeFixture(stateDir);
  const temporalExe = await findTemporalExe();
  if (!temporalExe) throw new Error("temporal.exe not found: winget install Temporal.TemporalCLI");

  // 1. dev server
  let server: ChildProcess | null = null;
  if (await isPortOpen("127.0.0.1", 7233)) {
    log("reusing the Temporal dev server already on 127.0.0.1:7233");
  } else {
    const fd = fs.openSync(path.join(stateDir, "temporal-server.log"), "w");
    server = spawn(temporalExe, [...devServerArgs(path.join(stateDir, "temporal.db")), "--log-level", "error"], { stdio: ["ignore", fd, fd], windowsHide: true });
    await waitFor("Temporal dev server", () => isPortOpen("127.0.0.1", 7233), 60_000);
    log(`started Temporal dev server (UI ${TEMPORAL_UI})`);
  }

  const connection = await Connection.connect({ address: "127.0.0.1:7233" });
  const client = new Client({ connection });
  const workflowId = `twotoe-crash-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const journalDir = path.join(stateDir, "cache", workflowId);
  const journal = () => readJournal(journalDir);
  let worker2: ChildProcess | null = null;
  try {
    // 2. worker with the injected delay, then the workflow
    const w1 = startWorker(stateDir, "worker-1", ["--inject-model-delay", String(DELAY_MS)]);
    await waitFor("worker 1 ready", () => fs.readFileSync(w1.logPath, "utf8").includes("worker ready"), 120_000);
    log(`worker 1 ready (pid ${w1.child.pid}); starting ${workflowId}`);
    const started = Date.now();
    const handle = await client.workflow.start("nightlyTriage", { taskQueue: TASK_QUEUE, workflowId, args: [{ configPath, offline: true }] });

    // 3. kill 8 s into the injected delay (the model has answered and its response is cached)
    await waitFor("model activity to enter the injected delay", () => journal().some((e) => e.event === "delay-start"), 300_000);
    log(`model answered after ${((Date.now() - started) / 1000).toFixed(1)}s; killing worker 1 in ${KILL_AFTER_MS / 1000}s`);
    await sleep(KILL_AFTER_MS);
    const killedAt = new Date();
    await killTree(w1.child.pid!);
    log(`taskkill /PID ${w1.child.pid} /T /F at +${((killedAt.getTime() - started) / 1000).toFixed(1)}s`);

    // 4. restart (no injected delay) and wait for the result
    const w2 = startWorker(stateDir, "worker-2", []);
    worker2 = w2.child;
    await waitFor("worker 2 ready", () => fs.readFileSync(w2.logPath, "utf8").includes("worker ready"), 120_000);
    log(`worker 2 ready (pid ${w2.child.pid}); waiting for the workflow (heartbeat timeout is 30s)`);
    const result = await handle.result();
    const totalS = ((Date.now() - started) / 1000).toFixed(1);

    // 5. history via the Temporal CLI, plus the journal
    const show = await runFile(temporalExe, ["workflow", "show", "--workflow-id", workflowId, "--address", "127.0.0.1:7233", "--output", "json"], { timeoutMs: 30_000 });
    if (!show.ok) throw new Error("temporal workflow show failed");
    const parsed = JSON.parse(show.stdout) as { events?: HistoryEvent[] } | HistoryEvent[];
    const events = Array.isArray(parsed) ? parsed : parsed.events ?? [];
    const typeOf = new Map<string, string>();
    for (const e of events) if (isType(e, "ActivityTaskScheduled")) typeOf.set(String(e.eventId), e.activityTaskScheduledEventAttributes?.activityType?.name ?? "?");
    const completed = events.filter((e) => isType(e, "ActivityTaskCompleted"))
      .map((e) => ({ name: typeOf.get(String(e.activityTaskCompletedEventAttributes?.scheduledEventId)) ?? "?", at: new Date(e.eventTime) }));
    const startedEv = events.filter((e) => isType(e, "ActivityTaskStarted"))
      .map((e) => ({ name: typeOf.get(String(e.activityTaskStartedEventAttributes?.scheduledEventId)) ?? "?", attempt: e.activityTaskStartedEventAttributes?.attempt ?? 1 }));
    const beforeCrash = completed.filter((c) => c.at < killedAt).map((c) => c.name);
    const retried = startedEv.filter((s) => s.attempt > 1);
    const completions = new Map<string, number>();
    for (const c of completed) completions.set(c.name, (completions.get(c.name) ?? 0) + 1);
    const historyTwice = [...completions].filter(([, n]) => n > 1).map(([name]) => name);
    const j = journal();
    const count = (pred: (e: JournalEvent) => boolean) => j.filter(pred).length;
    const computed = new Map<string, number>();
    for (const e of j.filter((x) => x.event === "computed")) computed.set(e.activity, (computed.get(e.activity) ?? 0) + 1);
    const journalTwice = [...computed].filter(([, n]) => n > 1).map(([name]) => name);
    // One model request per writer attempt (2 if the validator rejected attempt 1). A request
    // computed twice would show up as two "model-call" events with the same key.
    const modelCalls = count((e) => e.event === "model-call");
    const modelReused = count((e) => e.event === "model-cache-hit");
    const callsPerKey = new Map<string, number>();
    for (const e of j.filter((x) => x.event === "model-call")) callsPerKey.set(e.key ?? "?", (callsPerKey.get(e.key ?? "?") ?? 0) + 1);
    const modelTwice = [...callsPerKey.values()].filter((n) => n > 1).length;
    const leaked = fs.readdirSync(stateDir, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.endsWith(".db") && !d.parentPath.includes(`${path.sep}fixture`))
      .filter((d) => fs.readFileSync(path.join(d.parentPath, d.name), "utf8").includes(CANARY)).length;

    const summary = {
      workflowId,
      result,
      totalSeconds: Number(totalS),
      completedBeforeCrash: beforeCrash,
      retried: retried.map((r) => `${r.name} (attempt ${r.attempt})`),
      executedTwice: { history: historyTwice, journal: journalTwice, count: historyTwice.length + journalTwice.length },
      modelCalls,
      modelResultsReusedFromCache: modelReused,
      modelRequestsComputedTwice: modelTwice,
      canaryHitsInStateDir: leaked,
    };
    fs.writeFileSync(path.join(stateDir, "crash-test-summary.json"), JSON.stringify(summary, null, 2));
    const line = (k: string, v: string) => process.stdout.write(redactText(`  ${k.padEnd(34)} ${v}\n`));
    process.stdout.write("\nTwoToe crash test summary\n");
    line("workflow", `${workflowId} -> ${result.mode}, ${result.actions} checklist items, ${totalS}s`);
    line("killed", `worker 1, ${KILL_AFTER_MS / 1000}s into a ${DELAY_MS / 1000}s delay inside writeBriefWithValidation`);
    line("activities completed before crash", `${beforeCrash.length} (${beforeCrash.join(", ")})`);
    line("activities retried", `${retried.length} (${summary.retried.join(", ")})`);
    line("activities executed twice", `${summary.executedTwice.count}   <- must be 0`);
    line("model calls / reused from cache", `${modelCalls} / ${modelReused}`);
    line("model requests computed twice", `${modelTwice}   <- must be 0`);
    line("canary hits in cache, logs, briefs", String(leaked));
    line("history", `temporal workflow show --workflow-id ${workflowId}`);
    line("timeline", `${TEMPORAL_UI}/namespaces/default/workflows/${workflowId}`);
    line("artifacts", stateDir);
    return summary.executedTwice.count === 0 && modelTwice === 0 && leaked === 0 ? 0 : 1;
  } finally {
    if (worker2?.pid) await killTree(worker2.pid);
    await connection.close();
    if (server?.pid && !keepServer) await killTree(server.pid);
    if (server && keepServer) log(`dev server left running for the UI recording: ${TEMPORAL_UI}`);
  }
}

main().then((code) => { process.exitCode = code; }, (err: Error) => {
  process.stderr.write(`[crash-test] FAILED: ${err.message}\n`);
  process.exitCode = 2;
});
