import { Command } from "commander";
import { EXIT_ERROR, runBrief } from "./commands/brief";
import { runScan } from "./commands/scan";

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
  .option("--no-machine", "skip machine-level Python locations")
  .action(async (roots: string[], opts: { llm?: boolean; offline?: boolean; fixture?: string; region?: string; model?: string; json?: boolean; machine?: boolean }) => {
    process.exitCode = await runBrief(roots, opts);
  });

program.parseAsync(process.argv).catch(() => {
  // Error text can carry paths; print a fixed message only.
  process.stderr.write("twotoe: command failed\n");
  process.exitCode = EXIT_ERROR;
});
