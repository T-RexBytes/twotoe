import fs from "node:fs";
import path from "node:path";
import { redactText, type Brief, type Finding } from "@twotoe/core";

// Run details the card shows next to the brief (model latency, checks run).
export interface PersistedRun {
  checksRun: number | null;
  promptVersion: string | null;
  attempts: Array<{ attempt: number; wallMs: number; evalCount?: number; promptEvalCount?: number; reasons: string[] }>;
}

// <stateDir>/briefs/<date>.json and latest.json (the card reads latest.json,
// SPEC 13.3), plus findings and run details. Redacted on the way out.
export function persistBrief(stateDir: string, brief: Brief, findings: Finding[], run?: PersistedRun): { briefPath: string; latestPath: string } {
  const dir = path.join(stateDir, "briefs");
  fs.mkdirSync(dir, { recursive: true });
  const write = (name: string, value: unknown) => {
    const target = path.join(dir, name);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, redactText(JSON.stringify(value, null, 2)));
    fs.renameSync(tmp, target);
    return target;
  };
  const briefPath = write(`${brief.date}.json`, brief);
  write(`${brief.date}.findings.json`, findings);
  const latestPath = write("latest.json", brief);
  write("latest.findings.json", findings);
  if (run) {
    write(`${brief.date}.run.json`, run);
    write("latest.run.json", run);
  }
  return { briefPath, latestPath };
}

export function readPersisted(stateDir: string): { brief: Brief; findings: Finding[]; run: PersistedRun | null } | null {
  const dir = path.join(stateDir, "briefs");
  const read = <T>(name: string): T | null => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as T;
    } catch {
      return null;
    }
  };
  const brief = read<Brief>("latest.json");
  if (!brief) return null;
  return { brief, findings: read<Finding[]>("latest.findings.json") ?? [], run: read<PersistedRun>("latest.run.json") };
}
