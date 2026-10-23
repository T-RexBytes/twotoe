import path from "node:path";
import pc from "picocolors";
import { loadPack, redactText, twotoeHome, type Advisory, type Brief, type Finding } from "@twotoe/core";
import { readPersisted } from "@twotoe/worker";
import { makeBrief } from "./brief";

// SPEC 12 `twotoe explain <findingId>`: evidence rows, the advisory, sources.
// Reads the latest saved brief, or runs a template brief on a fixture.

export interface ExplainOptions {
  fixture?: string;
  stateDir?: string;
  json?: boolean;
}

export type Lookup =
  | { kind: "found"; finding: Finding }
  | { kind: "ambiguous"; ids: string[] }
  | { kind: "missing"; ids: string[] };

// Exact id, or a unique prefix (ids look like `nodejs-2026-10-21:3f9a1c2b`).
export function findFinding(findings: Finding[], query: string): Lookup {
  const exact = findings.find((f) => f.id === query);
  if (exact) return { kind: "found", finding: exact };
  const q = query.toLowerCase();
  const hits = findings.filter((f) => f.id.toLowerCase().startsWith(q));
  if (hits.length === 1) return { kind: "found", finding: hits[0]! };
  if (hits.length > 1) return { kind: "ambiguous", ids: hits.map((f) => f.id) };
  return { kind: "missing", ids: findings.map((f) => f.id) };
}

// "label  text" with the text wrapped at word boundaries under itself.
export function field(label: string, text: string, width = 96): string[] {
  const indent = "  " + "".padEnd(12);
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && indent.length + line.length + 1 + word.length > width) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.map((l, i) => (i === 0 ? `  ${label.padEnd(12)}${l}` : `${indent}${l}`));
}

export function renderExplain(finding: Finding, advisory: Advisory | undefined, brief: Brief | null, color = true): string {
  const c = color ? pc : { bold: (s: string) => s, dim: (s: string) => s };
  const item = brief?.checklist.find((i) => i.findingId === finding.id);
  const out: string[] = [];
  out.push(`  ${c.bold(finding.id)}`, "");
  if (advisory) out.push(`  ${advisory.title}`, `  ${c.dim(`vendor ${advisory.vendor}, disclosed ${advisory.disclosedAt}`)}`, "");
  out.push(...field("confidence", finding.confidence));
  out.push(...field("severity", `${finding.severity}${advisory?.kev ? `, in CISA KEV${advisory.kevDueDate ? ` (due ${advisory.kevDueDate})` : ""}` : ""}`));
  out.push(...field("priority", `${finding.priority} (lower is more urgent)`));
  if (advisory?.cves.length) out.push(...field("CVEs", advisory.cves.join(", ")));
  out.push("");
  if (item) out.push(...field("action", item.action), ...field("why", item.why), "");
  else if (advisory) out.push(...field("action", advisory.action), "");
  if (advisory) out.push(...field("summary", advisory.summary), "");
  out.push("  evidence (what code found; no file contents, no values)");
  for (const e of finding.evidence) out.push(`    ${e.detector.padEnd(18)} ${e.location}`, `    ${"".padEnd(18)} ${c.dim(e.detail)}`);
  out.push("");
  if (advisory) {
    out.push(`  sources (checked ${advisory.verifiedAt})`);
    for (const u of advisory.sourceUrls) out.push(`    ${u}`);
    out.push("");
  }
  out.push(`  ${c.dim("TwoToe can be wrong. The vendor advisory is the source of truth.")}`);
  return out.join("\n");
}

async function loadFindings(opts: ExplainOptions): Promise<{ brief: Brief | null; findings: Finding[] } | null> {
  if (opts.fixture) {
    const res = await makeBrief([], { fixture: opts.fixture, llm: false, offline: true });
    return { brief: res.brief, findings: res.findings };
  }
  const saved = readPersisted(path.resolve(opts.stateDir ?? twotoeHome()));
  return saved ? { brief: saved.brief, findings: saved.findings } : null;
}

export async function runExplain(id: string, opts: ExplainOptions): Promise<number> {
  const out = (s: string) => process.stdout.write(`${redactText(s)}\n`);
  const data = await loadFindings(opts);
  if (!data) {
    out("No saved brief yet. Run `twotoe brief --save` first, or pass --fixture <dir>.");
    return 2;
  }
  const hit = findFinding(data.findings, id);
  if (hit.kind !== "found") {
    out(hit.kind === "ambiguous" ? `"${id}" matches more than one finding:` : `No finding "${id}" in the ${opts.fixture ? "fixture" : "latest"} brief.${hit.ids.length ? " Findings:" : ""}`);
    for (const i of hit.ids) out(`  ${i}`);
    return 2;
  }
  const advisory = loadPack().advisories.find((a) => a.id === hit.finding.advisoryId);
  if (opts.json) out(JSON.stringify({ finding: hit.finding, advisory: advisory ?? null, checklistItem: data.brief?.checklist.find((i) => i.findingId === hit.finding.id) ?? null }, null, 2));
  else out(renderExplain(hit.finding, advisory, data.brief, process.stdout.isTTY === true));
  return 0;
}
