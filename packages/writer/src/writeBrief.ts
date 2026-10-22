import type { AdvisoryPack, Finding } from "@twotoe/core";
import { KNOWN_VENDORS } from "@twotoe/core";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BriefDraft } from "./draft";
import type { ModelClient } from "./ollama";
import { buildUserPrompt, PROMPT_VERSION, SYSTEM } from "./prompts";
import { MAX_CHECKLIST, templateDraft } from "./template";
import { validateDetailed, type Validation } from "./validate";

// SPEC 10.5 retry policy: attempt 1 -> validate -> attempt 2 with the
// rejection reasons -> if still rejected, the template writes the failing
// parts only (mode llm-fallback). Every reason is kept for brief.meta.

export const BRIEF_DRAFT_SCHEMA = (() => {
  const { $schema: _drop, ...schema } = zodToJsonSchema(BriefDraft, { $refStrategy: "none" }) as Record<string, unknown>;
  return schema;
})();

export interface AttemptLog {
  attempt: number;
  wallMs: number;
  promptEvalCount?: number;
  evalCount?: number;
  loadDurationMs?: number;
  reasons: string[];
}

export interface WriteResult {
  draft: BriefDraft;
  mode: "llm" | "template" | "llm-fallback";
  model: string | null;
  attempts: number;
  rejections: string[];
  attemptLog: AttemptLog[];
  fallbackParts: string[];    // finding ids, "line1Actions", "line2Tail", "fyi"
  promptVersion: string;
}

export interface WriteOptions {
  findings: Finding[];
  pack: AdvisoryPack;
  date: string;
  roots: string[];
  client: ModelClient;
  model: string;
  maxAttempts?: number;
  think?: boolean;
  seed?: number;
}

// Code-side polish that changes no facts: trim, and lowercase the first word
// of a line-1 action unless it is a product name ("Plex", "Node").
function normalize(draft: BriefDraft, order: string[]): BriefDraft {
  const vendors = new Set(KNOWN_VENDORS);
  const rank = new Map(order.map((id, i) => [id, i]));
  return {
    line1Actions: draft.line1Actions.map((a) => {
      const t = a.trim();
      const first = t.split(/\s/)[0] ?? "";
      return vendors.has(first) ? t : t.charAt(0).toLowerCase() + t.slice(1);
    }),
    line2Tail: draft.line2Tail.trim(),
    checklist: [...draft.checklist]
      .map((c) => ({ findingId: c.findingId, action: c.action.trim(), why: c.why.trim() }))
      .sort((a, b) => (rank.get(a.findingId) ?? 99) - (rank.get(b.findingId) ?? 99)),
    fyi: draft.fyi.map((f) => f.trim()),
  };
}

function shortZodError(err: { issues: Array<{ path: (string | number)[]; message: string }> }): string {
  return err.issues.slice(0, 3).map((i) => `${i.path.join(".") || "draft"}: ${i.message}`).join("; ");
}

// Keeps every part of the model draft that passed and takes the template for the rest.
function merge(model: BriefDraft, v: Validation, template: BriefDraft, expected: string[]): { draft: BriefDraft; parts: string[] } {
  const parts: string[] = [];
  const modelItems = new Map(model.checklist.map((c) => [c.findingId, c]));
  const templateItems = new Map(template.checklist.map((c) => [c.findingId, c]));
  const checklist = expected.map((id) => {
    const m = modelItems.get(id);
    if (m && !v.badItems.has(id)) return m;
    parts.push(id);
    return templateItems.get(id)!;
  });
  if (v.line1Bad) parts.push("line1Actions");
  if (v.tailBad) parts.push("line2Tail");
  if (v.fyiBad) parts.push("fyi");
  return {
    parts,
    draft: {
      checklist,
      line1Actions: v.line1Bad ? template.line1Actions : model.line1Actions,
      line2Tail: v.tailBad ? template.line2Tail : model.line2Tail,
      fyi: v.fyiBad ? template.fyi : model.fyi,
    },
  };
}

export async function writeDraft(opts: WriteOptions): Promise<WriteResult> {
  const template = templateDraft(opts.findings, opts.pack);
  const base = { promptVersion: PROMPT_VERSION, attemptLog: [] as AttemptLog[], fallbackParts: [] as string[] };
  // Nothing to phrase: no model call at all.
  if (opts.findings.length === 0) {
    return { ...base, draft: template, mode: "template", model: null, attempts: 0, rejections: [] };
  }

  const advisoryKev = new Map(opts.pack.advisories.map((a) => [a.id, a.kev]));
  const kevOf = (f: Finding) => advisoryKev.get(f.advisoryId) ?? false;
  const expected = opts.findings.filter((f) => f.confidence !== "fyi").slice(0, MAX_CHECKLIST).map((f) => f.id);
  const maxAttempts = opts.maxAttempts ?? 2;
  const rejections: string[] = [];
  let lastReasons: string[] = [];
  let lastDraft: BriefDraft | null = null;
  let lastValidation: Validation | null = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    const user = buildUserPrompt(opts.findings, opts.pack, opts.date, opts.roots, lastReasons);
    let reasons: string[];
    const log: AttemptLog = { attempt, wallMs: 0, reasons: [] };
    try {
      const res = await opts.client.chat({
        model: opts.model, system: SYSTEM, user, schema: BRIEF_DRAFT_SCHEMA, think: opts.think ?? false,
        ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
      });
      Object.assign(log, {
        wallMs: res.wallMs,
        ...(res.promptEvalCount !== undefined ? { promptEvalCount: res.promptEvalCount } : {}),
        ...(res.evalCount !== undefined ? { evalCount: res.evalCount } : {}),
        ...(res.loadDurationMs !== undefined ? { loadDurationMs: res.loadDurationMs } : {}),
      });
      let json: unknown;
      try {
        json = JSON.parse(res.content);
      } catch {
        json = undefined;
      }
      const parsed = json === undefined ? null : BriefDraft.safeParse(json);
      if (!parsed) {
        reasons = ["output is not valid JSON"];
      } else if (!parsed.success) {
        reasons = [`output does not match the schema (${shortZodError(parsed.error)})`];
      } else {
        const draft = normalize(parsed.data, expected);
        const v = validateDetailed(draft, opts.findings, kevOf);
        reasons = v.reasons;
        lastDraft = draft;
        lastValidation = v;
        if (reasons.length === 0) {
          base.attemptLog.push(log);
          return { ...base, draft, mode: "llm", model: opts.model, attempts, rejections };
        }
      }
    } catch (err) {
      reasons = [`model call failed: ${(err as Error).name === "TimeoutError" ? "timed out" : (err as Error).message.slice(0, 120)}`];
      log.reasons = reasons;
      base.attemptLog.push(log);
      rejections.push(...reasons.map((r) => `attempt ${attempt}: ${r}`));
      break;   // Ollama down or blocked: retrying will not help
    }
    log.reasons = reasons;
    base.attemptLog.push(log);
    rejections.push(...reasons.map((r) => `attempt ${attempt}: ${r}`));
    lastReasons = reasons;
  }

  // Fallback: keep the valid parts of the last parsed draft, template the rest.
  if (lastDraft && lastValidation) {
    const merged = merge(lastDraft, lastValidation, template, expected);
    const recheck = validateDetailed(merged.draft, opts.findings, kevOf);
    if (recheck.reasons.length === 0) {
      return { ...base, draft: merged.draft, mode: "llm-fallback", model: opts.model, attempts, rejections, fallbackParts: merged.parts };
    }
  }
  return { ...base, draft: template, mode: "llm-fallback", model: opts.model, attempts, rejections, fallbackParts: ["all"] };
}
