import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { runSleep } from "../src/commands/sleep";
import { launcherScript, plans, registerEnv, registerScript, unregisterScript, writeLaunchers, type PlanContext } from "../src/taskScheduler";

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
afterEach(() => vi.restoreAllMocks());

const ctx: PlanContext = {
  node: "C:\\Program Files\\nodejs\\node.exe",
  repo: "D:\\work\\twotoe",
  cliEntry: "D:\\work\\twotoe\\packages\\cli\\src\\index.ts",
  temporalExe: "C:\\Users\\alice\\AppData\\Local\\Microsoft\\WinGet\\Links\\temporal.exe",
  stateDir: "C:\\Users\\alice\\.twotoe",
  at: "03:00",
};

describe("Task Scheduler plans (SPEC 11.3)", () => {
  it("--no-temporal: one daily brief at 03:00 with WakeToRun", () => {
    const [p, ...rest] = plans("no-temporal", ctx);
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ name: "TwoToe-Nightly", trigger: { type: "daily", at: "03:00" }, wakeToRun: true });
    expect(p!.launch).toEqual({ exe: ctx.node, args: ["--import", "tsx", ctx.cliEntry, "brief", "--save"], cwd: ctx.repo, log: path.join(ctx.stateDir, "logs", "TwoToe-Nightly.log") });
    expect(p!.description).toContain("StartWhenAvailable");
  });

  it("--taskscheduler: dev server and worker at log on, server bound to loopback with a persistent DB", () => {
    const [server, worker] = plans("temporal", ctx);
    expect(server).toMatchObject({ name: "TwoToe-TemporalServer", trigger: { type: "logon" } });
    expect(server!.launch.args).toEqual(["server", "start-dev", "--ip", "127.0.0.1", "--port", "7233", "--ui-port", "8233", "--db-filename", path.join(ctx.stateDir, "temporal.db")]);
    expect(worker!.launch.args.slice(-4)).toEqual(["worker", "--ensure-schedule", "--at", "03:00"]);
    expect(() => plans("temporal", { ...ctx, temporalExe: null })).toThrow(/winget install Temporal.TemporalCLI/);
  });

  it("every task name has the TwoToe- prefix that --uninstall removes", () => {
    for (const p of [...plans("temporal", ctx), ...plans("no-temporal", ctx)]) expect(p.name).toMatch(/^TwoToe-/);
    expect(unregisterScript()).toContain("Get-ScheduledTask -TaskName 'TwoToe-*'");
  });

  it("scripts are constant: values travel as env vars, never inside the script text", () => {
    const reg = registerScript();
    for (const p of plans("temporal", ctx)) {
      // User-derived values (names, descriptions, paths). Trigger keywords like 'logon' are fixed.
      const env = registerEnv(p, "C:\\x\\launch.ps1");
      for (const k of ["TWOTOE_TASK_NAME", "TWOTOE_TASK_DESC", "TWOTOE_TASK_LAUNCHER"] as const) expect(reg).not.toContain(env[k]);
    }
    expect(reg).toContain("$env:TWOTOE_TASK_NAME");
    expect(reg).toContain("-WindowStyle Hidden");
    expect(reg).toContain("-StartWhenAvailable");
    expect(launcherScript()).not.toMatch(/node\.exe|temporal\.exe|\\Users\\/);
  });

  it("launcher redirects at the OS level, so stderr logging cannot end the task", () => {
    // PowerShell 5.1 + ErrorActionPreference Stop + `*>>` killed the worker on its
    // first stderr line (Temporal SDK INFO logs). Start-Process redirection avoids that.
    const s = launcherScript();
    expect(s).not.toContain("*>>");
    expect(s).toContain("-RedirectStandardOutput $c.log");
    expect(s).toContain("-RedirectStandardError");
    expect(s).toContain("exit $p.ExitCode");
  });

  it("writes a static launcher plus a JSON spec per task", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "twotoe-tasks-"));
    dirs.push(dir);
    const p = plans("no-temporal", ctx)[0]!;
    const ps1 = writeLaunchers(dir, p);
    expect(fs.readFileSync(ps1, "utf8")).toBe(launcherScript());
    expect(JSON.parse(fs.readFileSync(ps1.replace(/\.ps1$/, ".json"), "utf8"))).toEqual(p.launch);
  });
});

describe("twotoe sleep --dry-run", () => {
  it("prints the plan and registers nothing", async () => {
    let out = "";
    vi.spyOn(process.stdout, "write").mockImplementation(((s: string) => { out += s; return true; }) as typeof process.stdout.write);
    expect(await runSleep({ temporal: false, dryRun: true, at: "02:30" })).toBe(0);
    expect(out).toContain("dry run: these tasks would be registered (nothing changed)");
    expect(out).toContain("\"name\": \"TwoToe-Nightly\"");
    expect(out).toContain("\"at\": \"02:30\"");
    expect(out.toLowerCase()).not.toContain(os.homedir().toLowerCase().replace(/\\/g, "\\\\"));
    expect(out.toLowerCase()).not.toContain(os.homedir().toLowerCase());
  });

  it("rejects a bad --at", async () => {
    await expect(runSleep({ at: "25:00", dryRun: true })).rejects.toThrow("--at must be HH:MM");
  });
});
