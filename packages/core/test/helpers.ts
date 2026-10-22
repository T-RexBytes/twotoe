import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

export const CANARY = "TWOTOE_CANARY_9f3a";

const made: string[] = [];
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

export function tempDir(prefix = "twotoe-test-"): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(d);
  return d;
}

// Writes a tree of files. Keys use forward slashes; contents are strings or Buffers.
export function makeTree(base: string, files: Record<string, string | Buffer>): string {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(base, ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return base;
}
