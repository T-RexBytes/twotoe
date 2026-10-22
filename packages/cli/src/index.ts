import { Command } from "commander";
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

program.parseAsync(process.argv).catch(() => {
  // Error text can carry paths; print a fixed message only.
  process.stderr.write("twotoe: scan failed\n");
  process.exitCode = 1;
});
