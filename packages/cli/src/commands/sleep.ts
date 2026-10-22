import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfigPath, redactText, twotoeHome } from "@twotoe/core";
import {
  devServerArgs, ensureSchedule, findTemporalExe, isPortOpen, localTimezone, parseAt, removeSchedule, TEMPORAL_UI, withClient,
} from "@twotoe/worker";
import { plans, registerEnv, registerScript, registerTasks, unregisterTasks, type PlanContext } from "../taskScheduler";

export interface SleepOptions {
  at?: string;
  taskscheduler?: boolean;
  temporal?: boolean;      // commander sets false for --no-temporal
  uninstall?: boolean;
  dryRun?: boolean;
  catchup?: string;
}

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

async function planContext(at: string): Promise<PlanContext> {
  return {
    node: process.execPath,
    repo: REPO,
    cliEntry: path.join(REPO, "packages", "cli", "src", "index.ts"),
    temporalExe: await findTemporalExe(),
    stateDir: twotoeHome(),
    at,
  };
}

// Display only: registered tasks keep the real paths, the screen shows ~ (CLAUDE.md rule 6).
const out = (s: string) => process.stdout.write(`${redactText(s)}\n`);

// SPEC 11.3 / 12: `twotoe sleep`. Returns the exit code.
export async function runSleep(opts: SleepOptions): Promise<number> {
  const at = opts.at ?? "03:00";
  parseAt(at);
  const serverUp = await isPortOpen("127.0.0.1", 7233);

  if (opts.uninstall) {
    if (opts.dryRun) { out("would remove every scheduled task named TwoToe-* and the twotoe-nightly schedule"); return 0; }
    const removed = await unregisterTasks();
    out(removed.length ? `removed tasks: ${removed.join(", ")}` : "no TwoToe tasks found");
    if (serverUp) out(await withClient(removeSchedule) ? "removed schedule twotoe-nightly" : "no Temporal schedule found");
    return 0;
  }

  if (opts.temporal === false || opts.taskscheduler) {
    const list = plans(opts.temporal === false ? "no-temporal" : "temporal", await planContext(at));
    if (opts.dryRun) {
      out("dry run: these tasks would be registered (nothing changed)");
      for (const p of list) out(JSON.stringify({ plan: p, env: registerEnv(p, `<stateDir>\\tasks\\${p.name}.ps1`) }, null, 2));
      out("registration script (values arrive as env vars):");
      out(registerScript());
      return 0;
    }
    const names = await registerTasks(twotoeHome(), list);
    out(`registered: ${names.join(", ")}`);
    if (opts.temporal === false) out(`TwoToe will run daily at ${at}; a missed run starts when the laptop is next available.`);
    else out("The Temporal dev server and the worker start at your next log on; the worker creates the schedule.");
    return 0;
  }

  if (!serverUp) {
    const exe = await findTemporalExe();
    out("No Temporal dev server on 127.0.0.1:7233.");
    if (!exe) out("Install the CLI: winget install Temporal.TemporalCLI");
    out(`Start it: temporal ${devServerArgs(path.join(twotoeHome(), "temporal.db")).join(" ")}`);
    out("Or run `twotoe sleep --taskscheduler` to start it at every log on, or `twotoe sleep --no-temporal` for plain Task Scheduler.");
    return 2;
  }
  const result = await withClient((c) => ensureSchedule(c, {
    configPath: defaultConfigPath(), at, ...(opts.catchup ? { catchupWindow: opts.catchup } : {}),
  }));
  out(`Schedule twotoe-nightly ${result}: every day at ${at} ${localTimezone()}, catch-up window ${opts.catchup ?? "6h"}.`);
  out(`Keep a worker running (\`twotoe worker\`), or use \`twotoe sleep --taskscheduler\`. Timeline: ${TEMPORAL_UI}`);
  return 0;
}
