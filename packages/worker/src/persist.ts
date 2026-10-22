import fs from "node:fs";
import path from "node:path";
import { redactText, type Brief, type Finding } from "@twotoe/core";

// <stateDir>/briefs/<date>.json and latest.json (the card reads latest.json,
// SPEC 13.3), plus the findings for evidence rows. Redacted on the way out.
export function persistBrief(stateDir: string, brief: Brief, findings: Finding[]): { briefPath: string; latestPath: string } {
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
  return { briefPath, latestPath };
}
