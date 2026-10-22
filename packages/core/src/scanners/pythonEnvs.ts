import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { programFilesDirs } from "../util/exec";
import { classifyError, forEachLine, type ReadOutcome, type SkipCounter } from "../util/safeFs";

// SPEC 8.2.3. Environments are discovered on disk; Python is never executed
// and nothing is imported (importing runs .pth files).

export interface NameVersion {
  name: string;
  version: string;
}

// PEP 503 normalized name: "LiteLLM" / "lite_llm" -> "litellm" / "lite-llm".
export function normalizePyName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

// "litellm-1.107.0.dist-info" -> { name: "litellm", version: "1.107.0" }.
// Returns null when the folder name is ambiguous (more than one "-"), in
// which case METADATA is read instead.
export function parseDistInfoName(folder: string): NameVersion | null {
  const m = folder.match(/^(.+)\.(dist-info|egg-info)$/i);
  if (!m) return null;
  const parts = m[1]!.split("-");
  if (m[2]!.toLowerCase() === "dist-info") {
    if (parts.length !== 2 || !/^\d/.test(parts[1]!)) return null;
    return { name: normalizePyName(parts[0]!), version: parts[1]! };
  }
  // egg-info: name-version[-pyX.Y]
  if (parts.length >= 2 && /^\d/.test(parts[1]!)) return { name: normalizePyName(parts[0]!), version: parts[1]! };
  return null;
}

// Reads Name/Version headers from METADATA (plain text, executes nothing) and
// stops at the first blank line.
export async function readMetadata(file: string): Promise<NameVersion | null> {
  let name: string | null = null;
  let version: string | null = null;
  await forEachLine(file, (line) => {
    if (!line.trim()) return false;
    const m = line.match(/^(Name|Version):\s*(.+)$/i);
    if (m) {
      if (m[1]!.toLowerCase() === "name") name = m[2]!.trim();
      else version = m[2]!.trim();
    }
    return !(name && version);
  });
  return name && version ? { name: normalizePyName(name), version } : null;
}

export interface SitePackagesInfo {
  dir: string;
  packages: NameVersion[];
  certifiPem: string | null;
}

export async function readSitePackages(dir: string, skips: SkipCounter): Promise<SitePackagesInfo> {
  const info: SitePackagesInfo = { dir, packages: [], certifiPem: null };
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    skips.note(classifyError(err));
    return info;
  }
  const seen = new Set<string>();
  for (const e of entries) {
    if (!/\.(dist-info|egg-info)$/i.test(e.name)) continue;
    let nv = parseDistInfoName(e.name);
    if (!nv && e.isDirectory()) {
      const meta = /dist-info$/i.test(e.name) ? "METADATA" : "PKG-INFO";
      nv = await readMetadata(path.join(dir, e.name, meta));
    }
    if (nv && !seen.has(`${nv.name}@${nv.version}`)) {
      seen.add(`${nv.name}@${nv.version}`);
      info.packages.push(nv);
    }
  }
  const pem = path.join(dir, "certifi", "cacert.pem");
  try {
    if ((await fs.promises.stat(pem)).isFile()) info.certifiPem = pem;
  } catch {
    // no certifi here
  }
  return info;
}

// Machine-level Python locations (Windows MUST, macOS/Linux SHOULD), as
// fast-glob patterns relative to the home directory.
export function machinePythonPatterns(platform: string): string[] {
  if (platform === "win32") {
    return [
      "AppData/Local/Programs/Python/Python3*/Lib/site-packages",
      "AppData/Roaming/Python/Python3*/site-packages",
      "AppData/Local/Packages/PythonSoftwareFoundation.Python.3.*/LocalCache/local-packages/Python3*/site-packages",
      "miniconda3/Lib/site-packages",
      "miniconda3/envs/*/Lib/site-packages",
      "anaconda3/Lib/site-packages",
      "anaconda3/envs/*/Lib/site-packages",
      "pipx/venvs/*/Lib/site-packages",
      "AppData/Local/pipx/pipx/venvs/*/Lib/site-packages",
      "AppData/Roaming/uv/tools/*/Lib/site-packages",
    ];
  }
  return [
    "Library/Python/3.*/lib/python/site-packages",
    ".local/lib/python3.*/site-packages",
    ".local/pipx/venvs/*/lib/python3.*/site-packages",
    "miniconda3/lib/python3.*/site-packages",
    "miniconda3/envs/*/lib/python3.*/site-packages",
    "anaconda3/lib/python3.*/site-packages",
  ];
}

export async function discoverMachineSitePackages(home: string, platform: string): Promise<string[]> {
  const opts = { onlyDirectories: true, absolute: true, suppressErrors: true, followSymbolicLinks: false, caseSensitiveMatch: false } as const;
  const found = await fg(machinePythonPatterns(platform), { ...opts, cwd: home });
  if (platform === "win32") {
    for (const pf of programFilesDirs()) found.push(...await fg(["Python3*/Lib/site-packages"], { ...opts, cwd: pf }));
  } else if (platform === "darwin") {
    found.push(...await fg(["lib/python3.*/site-packages"], { ...opts, cwd: "/opt/homebrew" }));
  }
  return found.map((p) => path.normalize(p));
}

// Dedupe by real path (venv symlinks such as lib64 -> lib, junctions).
export async function dedupeByRealpath(dirs: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of dirs) {
    let real: string;
    try {
      real = await fs.promises.realpath(d);
    } catch {
      continue;
    }
    const key = process.platform === "win32" ? real.toLowerCase() : real;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

export interface PinHit extends NameVersion {
  line: number;
}

// requirements*.txt exact pins: `name==1.2.3`, extras and markers allowed.
export function parseRequirementsLine(line: string): NameVersion | null {
  const t = line.replace(/\s+#.*$/, "").trim();
  if (!t || t.startsWith("#") || t.startsWith("-")) return null;
  const m = t.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*===?\s*([^\s;,]+)/);
  return m ? { name: normalizePyName(m[1]!), version: m[2]! } : null;
}

// poetry.lock / uv.lock: [[package]] blocks with name = "x" / version = "y".
export function parseTomlLock(text: string): PinHit[] {
  const out: PinHit[] = [];
  let name: string | null = null;
  let nameLine = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    if (t === "[[package]]") { name = null; return; }
    const m = t.match(/^(name|version)\s*=\s*"([^"]+)"/);
    if (!m) return;
    if (m[1] === "name") { name = m[2]!; nameLine = i + 1; }
    else if (name) { out.push({ name: normalizePyName(name), version: m[2]!, line: nameLine }); name = null; }
  });
  return out;
}

// Pipfile.lock: { default: { name: { version: "==1.2.3" } }, develop: {...} }
export function parsePipfileLock(text: string): PinHit[] {
  const out: PinHit[] = [];
  try {
    const data = JSON.parse(text) as Record<string, Record<string, { version?: unknown }>>;
    for (const section of ["default", "develop"]) {
      for (const [name, entry] of Object.entries(data[section] ?? {})) {
        const v = typeof entry?.version === "string" ? entry.version.replace(/^===?/, "") : null;
        if (v) out.push({ name: normalizePyName(name), version: v, line: 0 });
      }
    }
  } catch {
    // not JSON
  }
  return out;
}

// pyvenv.cfg `version = 3.12.1` or `version_info = 3.12.1.final.0`. Other
// lines (home = <path>) are dropped.
export async function readPyvenvVersion(file: string): Promise<{ outcome: ReadOutcome; version: string | null }> {
  let version: string | null = null;
  const outcome = await forEachLine(file, (line) => {
    const m = line.match(/^\s*version(?:_info)?\s*=\s*(\d+\.\d+(?:\.\d+)?)/i);
    if (m) { version = m[1]!; return false; }
  });
  return { outcome, version };
}
