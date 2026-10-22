import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// SPEC 11.3: activities cache their output on disk keyed by a hash of their
// input, under <stateDir>/cache/<workflowId>/. The journal is the ground truth
// for the crash test: what was computed, what came from cache, and when.

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as object).sort().map((k) => [k, stable((value as Record<string, unknown>)[k])]));
  }
  return value;
}

export function inputHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(input)) ?? "undefined").digest("hex").slice(0, 16);
}

export type JournalEventName =
  | "start" | "computed" | "cache-hit"
  | "model-call" | "model-cached" | "model-cache-hit"
  | "delay-start" | "injected-failure";

export interface JournalEvent {
  ts: string;
  activity: string;
  attempt: number;
  event: JournalEventName;
  key?: string;
}

// Workflow ids from the schedule contain characters Windows dislikes in names.
function safeDirName(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "_");
}

export class RunStore {
  readonly dir: string;

  constructor(cacheRoot: string, workflowId: string) {
    this.dir = path.join(cacheRoot, safeDirName(workflowId));
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private file(name: string, key: string): string {
    return path.join(this.dir, `${name}-${key}.json`);
  }

  read<T>(name: string, key: string): T | undefined {
    try {
      return JSON.parse(fs.readFileSync(this.file(name, key), "utf8")) as T;
    } catch {
      return undefined;
    }
  }

  // Write to a temp file, then rename: a crash mid-write never leaves half a result.
  write(name: string, key: string, value: unknown): void {
    const target = this.file(name, key);
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, target);
  }

  journal(e: Omit<JournalEvent, "ts">): void {
    fs.appendFileSync(path.join(this.dir, "journal.jsonl"), `${JSON.stringify({ ts: new Date().toISOString(), ...e })}\n`);
  }

  events(): JournalEvent[] {
    return readJournal(this.dir);
  }
}

export function readJournal(dir: string): JournalEvent[] {
  try {
    return fs.readFileSync(path.join(dir, "journal.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as JournalEvent);
  } catch {
    return [];
  }
}
