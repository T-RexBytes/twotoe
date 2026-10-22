import fs from "node:fs";
import path from "node:path";
import { classifyError, type SkipCounter } from "../util/safeFs";

export type FileCategory =
  | "env" | "compose" | "dockerfile" | "nodeVersionFile" | "packageJson"
  | "npmLock" | "pnpmLock" | "yarnLock" | "pyPins" | "railway" | "pyvenvCfg";

// Pure: decides what a file is from its name alone.
export function classifyFile(name: string): FileCategory | null {
  const lower = name.toLowerCase();
  if (lower === ".env" || lower.startsWith(".env.") || (lower.endsWith(".env") && lower.length > 4)) return "env";
  if (/^(docker-)?compose(\.[\w-]+)*\.ya?ml$/.test(lower)) return "compose";
  if (/^dockerfile(\..+)?$/.test(lower) || lower.endsWith(".dockerfile")) return "dockerfile";
  if (lower === ".nvmrc" || lower === ".node-version") return "nodeVersionFile";
  if (lower === "package.json") return "packageJson";
  if (lower === "package-lock.json" || lower === "npm-shrinkwrap.json") return "npmLock";
  if (lower === "pnpm-lock.yaml") return "pnpmLock";
  if (lower === "yarn.lock") return "yarnLock";
  if (/^requirements.*\.txt$/.test(lower) || lower === "poetry.lock" || lower === "uv.lock" || lower === "pipfile.lock") return "pyPins";
  if (lower === "railway.toml" || lower === "railway.json") return "railway";
  if (lower === "pyvenv.cfg") return "pyvenvCfg";
  return null;
}

// Directory names never descended into (SPEC 8.3).
export const SKIP_DIR_NAMES = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__", "$recycle.bin",
  ".hg", ".svn", ".turbo", ".cache",
]);

// Multi-segment paths skipped when they appear below a root.
const SKIP_DIR_SUFFIXES = [["appdata", "local", "temp"], ["library", "caches"]];

export interface WalkOptions {
  maxDepth?: number;      // SPEC 8.3: 6
  maxFiles?: number;      // SPEC 8.3: 200k
  concurrency?: number;
  exclude?: string[];     // absolute folders never walked (config.json `exclude`)
}

// A folder holding this file is skipped with everything under it. TwoToe's own
// eval/fixtures carries one, so a real scan never "finds" the planted test data.
export const IGNORE_MARKER = ".twotoe-ignore";

export interface WalkStats {
  filesVisited: number;
  dirsVisited: number;
  symlinksSkipped: number;
  oneDriveSkipped: number;
  excludedDirs: number;
  ignoredDirs: number;
  truncated: boolean;
}

export interface WalkResult {
  files: Record<FileCategory, string[]>;
  sitePackages: string[];
  stats: WalkStats;
}

function emptyFiles(): Record<FileCategory, string[]> {
  return {
    env: [], compose: [], dockerfile: [], nodeVersionFile: [], packageJson: [],
    npmLock: [], pnpmLock: [], yarnLock: [], pyPins: [], railway: [], pyvenvCfg: [],
  };
}

function shouldSkipDir(relSegments: string[]): "skip" | "onedrive" | null {
  const name = relSegments[relSegments.length - 1]!.toLowerCase();
  if (SKIP_DIR_NAMES.has(name)) return "skip";
  // OneDrive placeholders download on read; never walk them.
  if (name === "onedrive" || name.startsWith("onedrive -")) return "onedrive";
  const lower = relSegments.map((s) => s.toLowerCase());
  for (const suffix of SKIP_DIR_SUFFIXES) {
    if (lower.length >= suffix.length && suffix.every((s, i) => lower[lower.length - suffix.length + i] === s)) return "skip";
  }
  return null;
}

// Drops roots nested inside other roots (case-insensitive on Windows).
export function dedupeRoots(roots: string[]): string[] {
  const norm = (p: string) => {
    const r = path.resolve(p);
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  const sorted = [...new Set(roots.map((r) => path.resolve(r)))].sort((a, b) => a.length - b.length);
  const kept: string[] = [];
  for (const r of sorted) {
    const n = norm(r);
    if (!kept.some((k) => n === norm(k) || n.startsWith(norm(k) + path.sep))) kept.push(r);
  }
  return kept;
}

// Breadth-first walk of project roots. Never follows symlinks or junctions (no
// loops), never descends into site-packages (it is recorded instead), counts
// locked directories instead of crashing.
export async function walkRoots(roots: string[], skips: SkipCounter, opts: WalkOptions = {}): Promise<WalkResult> {
  const maxDepth = opts.maxDepth ?? 6;
  const maxFiles = opts.maxFiles ?? 200_000;
  const concurrency = opts.concurrency ?? 16;
  const files = emptyFiles();
  const sitePackages: string[] = [];
  const stats: WalkStats = { filesVisited: 0, dirsVisited: 0, symlinksSkipped: 0, oneDriveSkipped: 0, excludedDirs: 0, ignoredDirs: 0, truncated: false };
  const norm = (p: string) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  const excludes = (opts.exclude ?? []).map(norm);
  const excluded = (dir: string) => {
    const n = norm(dir);
    return excludes.some((x) => n === x || n.startsWith(x + path.sep));
  };

  type Job = { dir: string; rel: string[] };
  let queue: Job[] = dedupeRoots(roots).filter((r) => !excluded(r)).map((dir) => ({ dir, rel: [] }));

  const visit = async (job: Job, next: Job[]) => {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(job.dir, { withFileTypes: true });
    } catch (err) {
      skips.note(classifyError(err));
      return;
    }
    // Below a root, a folder that carries the marker is skipped whole.
    if (job.rel.length > 0 && entries.some((e) => e.isFile() && e.name === IGNORE_MARKER)) {
      stats.ignoredDirs++;
      return;
    }
    stats.dirsVisited++;
    for (const e of entries) {
      if (stats.filesVisited >= maxFiles) {
        stats.truncated = true;
        return;
      }
      const full = path.join(job.dir, e.name);
      if (e.isSymbolicLink()) {
        stats.symlinksSkipped++;
        continue;
      }
      if (e.isDirectory()) {
        if (e.name.toLowerCase() === "site-packages") {
          sitePackages.push(full);
          continue;
        }
        const rel = [...job.rel, e.name];
        if (rel.length > maxDepth) continue;
        const skip = shouldSkipDir(rel);
        if (skip === "onedrive") stats.oneDriveSkipped++;
        if (skip) continue;
        if (excluded(full)) {
          stats.excludedDirs++;
          continue;
        }
        next.push({ dir: full, rel });
      } else if (e.isFile()) {
        stats.filesVisited++;
        const cat = classifyFile(e.name);
        if (cat) files[cat].push(full);
      }
    }
  };

  while (queue.length > 0 && !stats.truncated) {
    const next: Job[] = [];
    for (let i = 0; i < queue.length; i += concurrency) {
      await Promise.all(queue.slice(i, i + concurrency).map((j) => visit(j, next)));
      if (stats.truncated) break;
    }
    queue = next;
  }
  for (const k of Object.keys(files) as FileCategory[]) files[k].sort();
  sitePackages.sort();
  return { files, sitePackages, stats };
}
