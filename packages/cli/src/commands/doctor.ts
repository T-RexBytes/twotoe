import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import {
  defaultConfigPath, defaultRoots, expandHome, installEgressGuard, Ledger, loadConfig, redactText, runFile,
  runPowerShell, systemExe, whichAll,
} from "@twotoe/core";
import { DEFAULT_OLLAMA_URL, resolveModel } from "@twotoe/writer";
import { findTemporalExe, isPortOpen } from "@twotoe/worker";
import { CARD_DIST } from "./card";
import { selfNodeStatus } from "./scan";

// SPEC 12 `twotoe doctor`: Windows specifics, Node, Ollama, model, Temporal,
// config. Pre-warms the model. Exit 0 when nothing is a problem, 2 otherwise.
// Warnings never fail the run. --fix prints commands; it never runs them.

export type CheckStatus = "ok" | "warn" | "problem";

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

export interface DoctorDeps {
  platform: NodeJS.Platform;
  nodeVersion: string;
  configPath: string;
  executionPolicy: () => Promise<string | null>;
  longPathsEnabled: () => Promise<boolean | null>;
  which: (cmd: string) => Promise<string[]>;
  ollamaTags: () => Promise<string[] | null>;
  warm: (model: string) => Promise<number | null>;
  temporalUp: () => Promise<boolean>;
  temporalExe: () => Promise<string | null>;
  scheduledTasks: () => Promise<string[] | null>;
  cardBuilt: () => boolean;
}

export interface DoctorOptions {
  fix?: boolean;
  warm?: boolean;      // commander sets false for --no-warm
  model?: string;
}

async function ollamaTags(): Promise<string[] | null> {
  try {
    const res = await fetch(`${DEFAULT_OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const body = await res.json() as { models?: Array<{ name?: string }> };
    return (body.models ?? []).map((m) => m.name ?? "").filter(Boolean);
  } catch {
    return null;
  }
}

// An empty prompt makes Ollama load the model and return (SPEC 10.1 pre-warm).
async function warmModel(model: string): Promise<number | null> {
  const started = Date.now();
  try {
    const res = await fetch(`${DEFAULT_OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Same num_ctx as the writer (SPEC 10.1): a different context size makes
      // Ollama reload the model on the first brief, and the warm-up is wasted.
      body: JSON.stringify({ model, prompt: "", keep_alive: "10m", options: { num_ctx: 8192 } }),
      signal: AbortSignal.timeout(90_000),
    });
    await res.text();
    return res.ok ? Date.now() - started : null;
  } catch {
    return null;
  }
}

export function realDoctorDeps(): DoctorDeps {
  return {
    platform: process.platform,
    nodeVersion: process.version,
    configPath: defaultConfigPath(),
    executionPolicy: async () => {
      const r = await runPowerShell("Get-ExecutionPolicy", {});
      return r.ok ? r.stdout.trim() || null : null;
    },
    // HKLM value only; reading it needs no admin and no environment.
    longPathsEnabled: async () => {
      const reg = systemExe("reg.exe");
      if (!reg) return null;
      const r = await runFile(reg, ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem", "/v", "LongPathsEnabled"]);
      if (!r.ok) return null;
      const m = /LongPathsEnabled\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(r.stdout);
      return m ? Number.parseInt(m[1]!, 16) === 1 : null;
    },
    which: whichAll,
    ollamaTags,
    warm: warmModel,
    temporalUp: () => isPortOpen("127.0.0.1", 7233),
    temporalExe: () => findTemporalExe(),
    scheduledTasks: async () => {
      const r = await runPowerShell("Get-ScheduledTask -TaskName 'TwoToe-*' -ErrorAction SilentlyContinue | ForEach-Object { $_.TaskName }", {});
      return r.ok ? r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : null;
    },
    cardBuilt: () => fs.existsSync(path.join(CARD_DIST, "index.html")),
  };
}

export async function runChecks(deps: DoctorDeps, opts: DoctorOptions = {}): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // Node: TwoToe itself should not run on a Node missing the Oct 21 fixes (SPEC 8.2.1).
  const self = selfNodeStatus(deps.nodeVersion);
  if (self.patched === true) add({ name: "Node", status: "ok", detail: `${self.version} has the Oct 21 security fixes` });
  else if (self.patched === false) add({ name: "Node", status: "problem", detail: `${self.version} is missing the Oct 21 security fixes`, fix: `Install Node ${self.fixed} or newer from https://nodejs.org/en/download` });
  else add({ name: "Node", status: "problem", detail: `${self.version} is not on a supported line (22, 24 or 26)`, fix: "Install Node 24.22.1 or newer from https://nodejs.org/en/download" });

  // Config: a file that exists but does not parse would break the nightly run.
  let config: ReturnType<typeof loadConfig> = {};
  let configOk = true;
  try {
    config = loadConfig(deps.configPath);
    const exists = fs.existsSync(deps.configPath);
    add({ name: "Config", status: "ok", detail: exists ? "~/.twotoe/config.json is valid" : "no ~/.twotoe/config.json (defaults are used)" });
  } catch {
    configOk = false;
    add({ name: "Config", status: "problem", detail: "~/.twotoe/config.json does not parse or has a wrong field", fix: "Fix the JSON, or move the file away to use defaults" });
  }
  const roots = (config.roots?.length ? config.roots.map((r) => expandHome(r)) : defaultRoots()).filter((r) => fs.existsSync(r));
  if (configOk) {
    if (roots.length === 0) add({ name: "Project roots", status: "warn", detail: "none of the scan roots exist, so only machine-level checks run", fix: "Add your project folders to \"roots\" in ~/.twotoe/config.json" });
    else if (config.roots?.length) add({ name: "Project roots", status: "ok", detail: `${roots.length} folder(s) will be scanned` });
    else add({ name: "Project roots", status: "warn", detail: `${roots.length} default folder(s) will be scanned`, fix: "Add your project folders to \"roots\" in ~/.twotoe/config.json, e.g. \"roots\": [\"~/code\"]" });
  }

  // Windows specifics (SPEC 5.4).
  if (deps.platform === "win32") {
    const policy = await deps.executionPolicy();
    if (policy === null) add({ name: "Execution policy", status: "warn", detail: "could not read it" });
    else if (/^(Restricted|AllSigned)$/i.test(policy)) add({ name: "Execution policy", status: "warn", detail: `${policy}: pnpm.ps1 and other script shims will not load`, fix: "Set-ExecutionPolicy -Scope CurrentUser RemoteSigned" });
    else add({ name: "Execution policy", status: "ok", detail: policy });

    const longPaths = await deps.longPathsEnabled();
    if (longPaths === true) add({ name: "Long paths", status: "ok", detail: "LongPathsEnabled is on" });
    else add({ name: "Long paths", status: "warn", detail: longPaths === false ? "LongPathsEnabled is off; deep node_modules paths may fail" : "could not read LongPathsEnabled", fix: "git config --global core.longpaths true   (and enable LongPathsEnabled in an admin PowerShell: New-ItemProperty -Path HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force)" });

    const pnpm = await deps.which("pnpm");
    if (pnpm.length === 0) add({ name: "pnpm", status: "warn", detail: "not on PATH (needed for development only)", fix: "corepack enable" });
    else add({ name: "pnpm", status: "ok", detail: pnpm.some((p) => /\.(cmd|bat|ps1)$/i.test(p)) ? "found as a shim (TwoToe spawns shims with an argument array, never a shell)" : "found" });
  }

  // Ollama and the model (SPEC 10.1).
  const tags = await deps.ollamaTags();
  let model: string | null = null;
  try {
    model = resolveModel({ flag: opts.model, config: config.model });
  } catch (err) {
    add({ name: "Model", status: "problem", detail: (err as Error).message });
  }
  if (tags === null) {
    add({ name: "Ollama", status: "problem", detail: "not reachable on 127.0.0.1:11434 (briefs fall back to the template)", fix: "Install Ollama from https://ollama.com/download and start it from the Start menu" });
  } else {
    add({ name: "Ollama", status: "ok", detail: `reachable, ${tags.length} model(s) installed` });
    if (model) {
      const present = tags.some((t) => t === model || t === `${model}:latest`);
      if (!present) add({ name: "Model", status: "problem", detail: `${model} is not installed`, fix: `ollama pull ${model}` });
      else if (opts.warm === false) add({ name: "Model", status: "ok", detail: `${model} installed (not pre-warmed)` });
      else {
        const ms = await deps.warm(model);
        add(ms === null
          ? { name: "Model", status: "warn", detail: `${model} installed, but the pre-warm request failed` }
          : { name: "Model", status: "ok", detail: `${model} loaded in ${(ms / 1000).toFixed(1)}s` });
      }
    }
  }

  // Temporal (SPEC 11.3). Only the nightly Temporal path needs it.
  const exe = await deps.temporalExe();
  const up = await deps.temporalUp();
  if (up) add({ name: "Temporal", status: "ok", detail: "dev server reachable on 127.0.0.1:7233" });
  else if (exe) add({ name: "Temporal", status: "warn", detail: "installed, but no server on 127.0.0.1:7233", fix: "twotoe sleep --taskscheduler   (or: temporal server start-dev --db-filename %USERPROFILE%\\.twotoe\\temporal.db)" });
  else add({ name: "Temporal", status: "warn", detail: "not installed (twotoe sleep --no-temporal works without it)", fix: "winget install Temporal.TemporalCLI" });

  if (deps.platform === "win32") {
    const tasks = await deps.scheduledTasks();
    if (tasks && tasks.length) add({ name: "Nightly run", status: "ok", detail: `scheduled tasks: ${tasks.join(", ")}` });
    else add({ name: "Nightly run", status: "warn", detail: "no TwoToe scheduled tasks", fix: "twotoe sleep --taskscheduler" });
  }

  add(deps.cardBuilt()
    ? { name: "Card", status: "ok", detail: "built" }
    : { name: "Card", status: "warn", detail: "not built (twotoe card needs it)", fix: "pnpm --filter @twotoe/card build" });
  return checks;
}

const MARK: Record<CheckStatus, string> = { ok: "ok  ", warn: "warn", problem: "FAIL" };

export function renderChecks(checks: Check[], fix: boolean, color = true): string {
  const paint: Record<CheckStatus, (s: string) => string> = color
    ? { ok: pc.green, warn: pc.yellow, problem: pc.red }
    : { ok: (s) => s, warn: (s) => s, problem: (s) => s };
  const width = Math.max(...checks.map((c) => c.name.length));
  const lines = checks.map((c) => `  ${paint[c.status](MARK[c.status])}  ${c.name.padEnd(width)}  ${c.detail}`);
  const fixes = checks.filter((c) => c.status !== "ok" && c.fix);
  if (fix && fixes.length) {
    lines.push("", "  To fix:");
    for (const c of fixes) lines.push(`    ${c.name}: ${c.fix}`);
  } else if (fixes.length) {
    lines.push("", "  Run `twotoe doctor --fix` for the commands that fix these.");
  }
  const problems = checks.filter((c) => c.status === "problem").length;
  lines.push("", problems ? `  ${problems} problem(s).` : "  Nothing blocks TwoToe.");
  return lines.join("\n");
}

export async function runDoctor(opts: DoctorOptions, deps: DoctorDeps = realDoctorDeps()): Promise<number> {
  const ledger = new Ledger();
  const uninstall = installEgressGuard({ ledger });
  try {
    const checks = await runChecks(deps, opts);
    process.stdout.write(redactText(renderChecks(checks, opts.fix === true, process.stdout.isTTY === true)) + "\n");
    return checks.some((c) => c.status === "problem") ? 2 : 0;
  } finally {
    uninstall();
  }
}
