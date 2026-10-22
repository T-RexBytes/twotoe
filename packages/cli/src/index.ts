import { Command } from "commander";
import { EXIT_ERROR, runBrief } from "./commands/brief";
import { runCard } from "./commands/card";
import { runScan } from "./commands/scan";
import { runSleep } from "./commands/sleep";
import { runWorkerCommand } from "./commands/worker";

// `| Select-Object -First 50` closes the pipe early; that is not an error.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const program = new Command();

program
  .name("twotoe")
  .description("Local overnight breach-week triage. Two lines at 7 a.m.")
  .version("0.0.0");

program
  .command("scan")
  .description("Collect facts from project roots and this machine (no judgment, no model)")
  .argument("[roots...]", "project roots to walk (default: ~\\code, ~\\projects, ...)")
  .option("--json", "print the inventory as JSON")
  .option("--fixture <dir>", "use eval fixture probe.json and project/ instead of this machine")
  .option("--no-machine", "skip machine-level Python locations")
  .action(async (roots: string[], opts: { json?: boolean; fixture?: string; machine?: boolean }) => {
    await runScan(roots, opts);
  });

program
  .command("brief")
  .description("Scan, match, write, and print the two lines plus the checklist")
  .argument("[roots...]", "project roots to walk (default: config roots, then ~\\code, ...)")
  .option("--no-llm", "template writer only, zero model calls")
  .option("--offline", "use the bundled advisory pack and KEV snapshot only")
  .option("--fixture <dir>", "use eval fixture probe.json, project/ and config.json")
  .option("--region <code>", "region for FYI items, e.g. IN")
  .option("--model <tag>", "local Ollama model tag (default: TWOTOE_MODEL, config, gemma4:e4b)")
  .option("--json", "print the brief and findings as JSON")
  .option("--save", "also write ~/.twotoe/briefs/latest.json (used by the Task Scheduler fallback)")
  .option("--no-machine", "skip machine-level Python locations")
  .action(async (roots: string[], opts: { llm?: boolean; offline?: boolean; fixture?: string; region?: string; model?: string; json?: boolean; save?: boolean; machine?: boolean }) => {
    process.exitCode = await runBrief(roots, opts);
  });

program
  .command("sleep")
  .description("Install the nightly run (Temporal schedule, or Windows Task Scheduler)")
  .option("--at <HH:MM>", "local time for the nightly run", "03:00")
  .option("--taskscheduler", "start the Temporal dev server and worker at every log on")
  .option("--no-temporal", "plain Task Scheduler: one daily `twotoe brief --save` with WakeToRun and StartWhenAvailable")
  .option("--uninstall", "remove every TwoToe-* task and the Temporal schedule")
  .option("--catchup <duration>", "Temporal catchupWindow for missed runs", "18h")
  .option("--dry-run", "show what would be registered and change nothing")
  .action(async (opts: { at?: string; taskscheduler?: boolean; temporal?: boolean; uninstall?: boolean; catchup?: string; dryRun?: boolean }) => {
    process.exitCode = await runSleep(opts);
  });

program
  .command("card")
  .description("Serve the latest brief as the morning card on 127.0.0.1:4777")
  .option("--port <n>", "port on 127.0.0.1", "4777")
  .option("--no-open", "do not open the browser")
  .option("--state-dir <dir>", "where briefs are saved (default ~/.twotoe)")
  .action(async (opts: { port?: string; open?: boolean; stateDir?: string }) => {
    process.exitCode = await runCard(opts);
  });

program
  .command("worker")
  .description("Run the Temporal worker for the nightly workflow")
  .option("--task-queue <name>", "task queue", "twotoe")
  .option("--state-dir <dir>", "cache, briefs and snapshots (default ~/.twotoe)")
  .option("--ensure-schedule", "create or update the nightly schedule on start")
  .option("--at <HH:MM>", "schedule time with --ensure-schedule", "03:00")
  .option("--config <file>", "config.json for the scheduled run (default ~/.twotoe/config.json)")
  .option("--inject-model-delay <ms>", "crash test only: pause inside the model activity after the model answers")
  .action(async (opts: { taskQueue?: string; stateDir?: string; ensureSchedule?: boolean; at?: string; config?: string; injectModelDelay?: string }) => {
    await runWorkerCommand(opts);
  });

program.parseAsync(process.argv).catch(() => {
  // Error text can carry paths; print a fixed message only.
  process.stderr.write("twotoe: command failed\n");
  process.exitCode = EXIT_ERROR;
});
