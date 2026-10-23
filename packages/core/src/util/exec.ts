import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_TIMEOUT_MS = 5000;

let emptyCwd: string | undefined;

// Every child runs from a fresh empty directory, because Windows resolves the
// current directory before PATH (a planted node.exe in a project must never run).
export function emptyDir(): string {
  if (!emptyCwd || !fs.existsSync(emptyCwd)) {
    emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), "twotoe-cwd-"));
  }
  return emptyCwd;
}

export interface RunResult {
  ok: boolean;
  stdout: string;
  timedOut: boolean;
}

export interface RunOptions {
  // Extra variables for the child, e.g. TWOTOE_P for PowerShell. By default the
  // child gets only these: TwoToe never copies its own environment into a
  // child, so NODE_OPTIONS and friends cannot inject code.
  env?: Record<string, string>;
  // Only for PATH lookups (where.exe / which): the child reads PATH itself.
  inheritEnv?: boolean;
  timeoutMs?: number;
}

// execFile with an argument array, no shell, a timeout, and stderr discarded
// (stderr can echo values). Never throws.
export function runFile(file: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    try {
      execFile(
        file,
        args,
        {
          cwd: emptyDir(),
          env: opts.inheritEnv ? undefined : { ...opts.env },
          timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          windowsHide: true,
          shell: false,
          maxBuffer: 8 * 1024 * 1024,
          encoding: "utf8",
        },
        (err, stdout) => {
          const timedOut = Boolean(err && (err as { killed?: boolean }).killed);
          resolve({ ok: !err, stdout: err ? "" : String(stdout), timedOut });
        },
      );
    } catch {
      resolve({ ok: false, stdout: "", timedOut: false });
    }
  });
}

// Candidate Windows system and Program Files roots, without reading env vars.
export function windowsDrives(home: string = os.homedir()): string[] {
  const drives = new Set(["C:\\"]);
  const root = path.win32.parse(home).root;
  if (/^[A-Za-z]:\\$/.test(root)) drives.add(root.toUpperCase());
  return [...drives];
}

export function systemExe(...rel: string[]): string | null {
  for (const d of windowsDrives()) {
    const p = path.win32.join(d, "Windows", "System32", ...rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function programFilesDirs(): string[] {
  const out: string[] = [];
  for (const d of windowsDrives()) {
    for (const name of ["Program Files", "Program Files (x86)"]) {
      const p = path.win32.join(d, name);
      if (fs.existsSync(p)) out.push(p);
    }
  }
  return out;
}

// All absolute paths for a command on PATH, or [] when absent.
export async function whichAll(cmd: string): Promise<string[]> {
  if (!/^[A-Za-z0-9._-]+$/.test(cmd)) return [];
  if (process.platform === "win32") {
    const where = systemExe("where.exe") ?? "where.exe";
    const r = await runFile(where, [cmd], { inheritEnv: true });
    if (!r.ok) return [];
    return r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  }
  const r = await runFile("/usr/bin/which", ["-a", cmd], { inheritEnv: true });
  if (!r.ok) return [];
  return r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

// First real executable (not a .cmd/.bat shim) for a command, absolute path.
export async function resolveExe(cmd: string): Promise<string | null> {
  const all = await whichAll(cmd);
  if (process.platform === "win32") {
    return all.find((p) => /\.exe$/i.test(p)) ?? null;
  }
  return all[0] ?? null;
}

export function powershellExe(): string | null {
  return process.platform === "win32" ? systemExe("WindowsPowerShell", "v1.0", "powershell.exe") : null;
}

// PowerShell with -NoProfile -NonInteractive. User-derived values travel only
// through `env`, never interpolated into the script text.
export async function runPowerShell(script: string, env: Record<string, string>, timeoutMs?: number): Promise<RunResult> {
  const ps = powershellExe();
  if (!ps) return { ok: false, stdout: "", timedOut: false };
  return runFile(ps, ["-NoProfile", "-NonInteractive", "-Command", script], { env, ...(timeoutMs ? { timeoutMs } : {}) });
}
