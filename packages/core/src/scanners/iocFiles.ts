import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { classifyError, type SkipCounter } from "../util/safeFs";

// SPEC 8.2.4, hard rule 2. IOC files are stat'ed and hashed as raw bytes.
// They are never read as text, never printed, never imported, never run.
// (Calls go through the `fs` object so tests can spy on them.)

export const IOC_FILENAMES = ["cook.pth", "cook.py", "sitecustomize.py"] as const;
const PYC_RE = /^(cook|sitecustomize)\..*\.pyc$/i;
const MAX_HASH_BYTES = 64 * 1024 * 1024;

export interface IocHit {
  filename: string;   // "cook.pth" or "__pycache__/cook.cpython-312.pyc"
  dir: string;        // the site-packages dir (absolute; redacted by the caller)
  size: number;
  sha256: string;
}

// Streamed SHA-256 over raw bytes (no encoding, so no text decode).
export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk as Buffer));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function statHit(dir: string, rel: string, skips: SkipCounter): Promise<IocHit | null> {
  const full = path.join(dir, ...rel.split("/"));
  let st: fs.Stats;
  try {
    st = await fs.promises.stat(full);
  } catch (err) {
    const outcome = classifyError(err);
    if (outcome !== "missing") skips.note(outcome);
    return null;
  }
  if (!st.isFile()) return null;
  let sha256 = "unhashed-too-large";
  if (st.size <= MAX_HASH_BYTES) {
    try {
      sha256 = await sha256File(full);
    } catch (err) {
      skips.note(classifyError(err));
      sha256 = "unhashed-locked";
    }
  }
  return { filename: rel, dir, size: st.size, sha256 };
}

export async function scanIocFiles(sitePackagesDir: string, skips: SkipCounter): Promise<IocHit[]> {
  const hits: IocHit[] = [];
  for (const name of IOC_FILENAMES) {
    const h = await statHit(sitePackagesDir, name, skips);
    if (h) hits.push(h);
  }
  // Cached bytecode left behind by the payload: names only from readdir.
  let names: string[] = [];
  try {
    names = await fs.promises.readdir(path.join(sitePackagesDir, "__pycache__"));
  } catch {
    // no __pycache__
  }
  for (const n of names.filter((x) => PYC_RE.test(x)).sort()) {
    const h = await statHit(sitePackagesDir, `__pycache__/${n}`, skips);
    if (h) hits.push(h);
  }
  return hits;
}
