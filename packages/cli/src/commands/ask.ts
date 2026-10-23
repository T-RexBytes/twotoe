import path from "node:path";
import pc from "picocolors";
import { installEgressGuard, Ledger, loadConfig, loadPack, redactText, twotoeHome, type Finding } from "@twotoe/core";
import { askQuestion, OllamaClient, resolveModel, type AskResult, type ModelClient } from "@twotoe/writer";
import { readPersisted } from "@twotoe/worker";
import { makeBrief } from "./brief";

// SPEC 12 `twotoe ask "<q>"` (STRETCH, story 10): a follow-up answered only
// from the latest brief's findings, checked by the grounding validator.

export interface AskOptions {
  fixture?: string;
  stateDir?: string;
  model?: string;
  json?: boolean;
  client?: ModelClient;    // tests inject a fake
}

// Word-wrapped at `width` with a two-space indent on every line.
export function wrapIndented(text: string, width = 96): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && 2 + line.length + 1 + word.length > width) { lines.push(`  ${line}`); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(`  ${line}`);
  return lines;
}

export function renderAnswer(r: AskResult, color = true): string {
  const dim = color ? pc.dim : (s: string) => s;
  const lines = [...wrapIndented(r.answer), ""];
  if (r.findingIds.length) lines.push(dim(`  based on: ${r.findingIds.join(", ")}   (twotoe explain <id> for evidence)`));
  const n = r.rejections.length;
  const verdict = r.mode === "llm"
    ? (n ? `validator: ${n} rejection(s), fixed on retry` : "validator: passed")
    : (r.attempts ? `validator: ${n} rejection(s), answered from the findings without the model` : "no model call, answered from the findings");
  lines.push(dim(`  ${verdict}`));
  return lines.join("\n");
}

export async function runAsk(question: string, opts: AskOptions): Promise<number> {
  const out = (s: string) => process.stdout.write(`${redactText(s)}\n`);
  if (!question.trim()) {
    out("Ask a question, e.g. twotoe ask \"why does the Node one matter?\"");
    return 2;
  }
  let findings: Finding[];
  if (opts.fixture) {
    findings = (await makeBrief([], { fixture: opts.fixture, llm: false, offline: true })).findings;
  } else {
    const saved = readPersisted(path.resolve(opts.stateDir ?? twotoeHome()));
    if (!saved) {
      out("No saved brief yet. Run `twotoe brief --save` first, or pass --fixture <dir>.");
      return 2;
    }
    findings = saved.findings;
  }
  const ledger = new Ledger();
  // Local model only; the guard blocks anything that is not loopback.
  const uninstall = installEgressGuard({ ledger, offline: true });
  try {
    let model: string;
    try {
      model = resolveModel({ flag: opts.model, config: loadConfig().model });
    } catch (err) {
      out(`twotoe: ${(err as Error).message}`);
      return 2;
    }
    const r = await askQuestion({ question, findings, pack: loadPack(), client: opts.client ?? new OllamaClient(), model });
    out(opts.json ? JSON.stringify({ ...r, model, egress: ledger.entries() }, null, 2) : renderAnswer(r, process.stdout.isTTY === true));
    return 0;
  } finally {
    uninstall();
  }
}
