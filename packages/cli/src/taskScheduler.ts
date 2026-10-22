import fs from "node:fs";
import path from "node:path";
import { runPowerShell } from "@twotoe/core";

// SPEC 11.3 "Running it on Windows". Tasks run hidden PowerShell launchers.
// The launcher scripts are static: what to run (exe, args, cwd) lives in a
// JSON file next to them, so no path is ever interpolated into script text.
// Registration values reach PowerShell through env vars only.

export const TASK_PREFIX = "TwoToe-";

export interface LaunchSpec {
  exe: string;
  args: string[];
  cwd: string;
}

export interface TaskPlan {
  name: string;
  description: string;
  trigger: { type: "logon" } | { type: "daily"; at: string };
  wakeToRun: boolean;
  launch: LaunchSpec;
}

const LAUNCHER = [
  "$ErrorActionPreference = 'Stop'",
  "$c = Get-Content -LiteralPath (Join-Path $PSScriptRoot ($MyInvocation.MyCommand.Name -replace '\\.ps1$', '.json')) -Raw | ConvertFrom-Json",
  "Set-Location -LiteralPath $c.cwd",
  "& $c.exe @($c.args)",
].join("\r\n");

export function launcherScript(): string {
  return LAUNCHER;
}

// Register one task. Values arrive as env vars; the script text is constant.
const REGISTER = [
  "$ErrorActionPreference = 'Stop'",
  "$arg = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + $env:TWOTOE_TASK_LAUNCHER + '\"'",
  "$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg",
  "$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name",
  "if ($env:TWOTOE_TASK_TRIGGER -eq 'logon') { $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user }",
  "else { $trigger = New-ScheduledTaskTrigger -Daily -At $env:TWOTOE_TASK_AT }",
  "$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 0)",
  "if ($env:TWOTOE_TASK_WAKE -eq '1') { $settings.WakeToRun = $true }",
  "$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited",
  "Register-ScheduledTask -TaskName $env:TWOTOE_TASK_NAME -Description $env:TWOTOE_TASK_DESC -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null",
].join("\n");

const UNREGISTER = [
  "$t = Get-ScheduledTask -TaskName 'TwoToe-*' -ErrorAction SilentlyContinue",
  "$t | ForEach-Object { $_.TaskName }",
  "$t | Unregister-ScheduledTask -Confirm:$false",
].join("\n");

export function registerScript(): string {
  return REGISTER;
}

export function unregisterScript(): string {
  return UNREGISTER;
}

export function registerEnv(plan: TaskPlan, launcherPath: string): Record<string, string> {
  return {
    TWOTOE_TASK_NAME: plan.name,
    TWOTOE_TASK_DESC: plan.description,
    TWOTOE_TASK_LAUNCHER: launcherPath,
    TWOTOE_TASK_TRIGGER: plan.trigger.type,
    TWOTOE_TASK_AT: plan.trigger.type === "daily" ? plan.trigger.at : "",
    TWOTOE_TASK_WAKE: plan.wakeToRun ? "1" : "0",
  };
}

export interface PlanContext {
  node: string;           // absolute node.exe
  repo: string;           // repo root (cwd, so `--import tsx` resolves)
  cliEntry: string;       // packages/cli/src/index.ts
  temporalExe: string | null;
  stateDir: string;       // ~/.twotoe
  at: string;
}

// --taskscheduler: dev server + worker at logon. --no-temporal: one daily brief.
export function plans(kind: "temporal" | "no-temporal", ctx: PlanContext): TaskPlan[] {
  const node = (args: string[]): LaunchSpec => ({ exe: ctx.node, args: ["--import", "tsx", ctx.cliEntry, ...args], cwd: ctx.repo });
  if (kind === "no-temporal") {
    return [{
      name: `${TASK_PREFIX}Nightly`,
      description: "TwoToe nightly brief (no Temporal). StartWhenAvailable catches up a missed run; WakeToRun wakes the laptop if wake timers are allowed.",
      trigger: { type: "daily", at: ctx.at },
      wakeToRun: true,
      launch: node(["brief", "--save"]),
    }];
  }
  if (!ctx.temporalExe) throw new Error("temporal.exe not found: install it with `winget install Temporal.TemporalCLI`");
  return [
    {
      name: `${TASK_PREFIX}TemporalServer`,
      description: "Temporal dev server for TwoToe (loopback only, history in ~/.twotoe/temporal.db).",
      trigger: { type: "logon" },
      wakeToRun: false,
      launch: {
        exe: ctx.temporalExe,
        args: ["server", "start-dev", "--ip", "127.0.0.1", "--port", "7233", "--ui-port", "8233", "--db-filename", path.join(ctx.stateDir, "temporal.db")],
        cwd: ctx.stateDir,
      },
    },
    {
      name: `${TASK_PREFIX}Worker`,
      description: "TwoToe Temporal worker. Creates or updates the nightly schedule on start.",
      trigger: { type: "logon" },
      wakeToRun: false,
      launch: node(["worker", "--ensure-schedule", "--at", ctx.at]),
    },
  ];
}

export function writeLaunchers(stateDir: string, plan: TaskPlan): string {
  const dir = path.join(stateDir, "tasks");
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, plan.name);
  fs.writeFileSync(`${base}.ps1`, LAUNCHER);
  fs.writeFileSync(`${base}.json`, JSON.stringify(plan.launch, null, 2));
  return `${base}.ps1`;
}

export async function registerTasks(stateDir: string, list: TaskPlan[]): Promise<string[]> {
  const done: string[] = [];
  for (const p of list) {
    const launcher = writeLaunchers(stateDir, p);
    const r = await runPowerShell(REGISTER, registerEnv(p, launcher));
    if (!r.ok) throw new Error(`could not register ${p.name}`);
    done.push(p.name);
  }
  return done;
}

export async function unregisterTasks(): Promise<string[]> {
  const r = await runPowerShell(UNREGISTER, {});
  return r.ok ? r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
}
