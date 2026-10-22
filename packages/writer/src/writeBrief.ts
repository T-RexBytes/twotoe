import type { AdvisoryPack, Finding } from "@twotoe/core";
import { KNOWN_VENDORS } from "@twotoe/core";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BriefDraft } from "./draft";
import type { ModelClient } from "./ollama";
import { buildUserPrompt, expectedCounts, PROMPT_VERSION, SYSTEM } from "./prompts";
import { MAX_CHECKLIST, templateDraft } from "./template";
import { NOOP_TRACER, type Tracer } from "./tracer";
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
  tracer?: Tracer;
  traceContent?: boolean;       // attach prompt/response text to spans (demo on fixtures only)
  forceRejectFirst?: boolean;   // demo trace: make attempt 1 visibly rejected
}

// Code-side polish that adds no facts: trim; keep only as many line-1 actions
// as there are top definite/likely findings (models add one for a "possible"
// item or split one action in two); empty FYI when there is no FYI finding
// (small models restate checklist facts there); lowercase the first word of a
// line-1 action unless it is a product name. What remains is still validated.
export function normalize(draft: BriefDraft, order: string[], counts: { line1: number; fyi: number }): BriefDraft {
  const vendors = new Set(KNOWN_VENDORS);
  const rank = new Map(order.map((id, i) => [id, i]));
  return {
    line1Actions: draft.line1Actions.slice(0, counts.line1).map((a) => {
      const t = a.trim();
      const first = t.split(/\s/)[0] ?? "";
      return vendors.has(first) ? t : t.charAt(0).toLowerCase() + t.slice(1);
    }),
    line2Tail: draft.line2Tail.trim(),
    checklist: [...draft.checklist]
      .map((c) => ({ findingId: c.findingId, action: c.action.trim(), why: c.why.trim() }))
      .sort((a, b) => (rank.get(a.findingId) ?? 99) - (rank.get(b.findingId) ?? 99)),
    fyi: counts.fyi === 0 ? [] : draft.fyi.map((f) => f.trim()),
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

  const tracer = opts.tracer ?? NOOP_TRACER;
  const agentAttrs = { "gen_ai.operation.name": "invoke_agent", "gen_ai.agent.name": "TwoToe", "gen_ai.request.model": opts.model, "twotoe.findings": opts.findings.length };
  return tracer.span("gen_ai.invoke_agent", "invoke_agent TwoToe", agentAttrs, async (agent) => {
    const result = await attemptLoop(opts, template, base, tracer);
    agent.set("twotoe.mode", result.mode);
    agent.set("twotoe.attempts", result.attempts);
    agent.set("twotoe.validator.rejections", result.rejections.length);
    return result;
  });
}

async function attemptLoop(opts: WriteOptions, template: BriefDraft, base: Pick<WriteResult, "promptVersion" | "attemptLog" | "fallbackParts">, tracer: Tracer): Promise<WriteResult> {
  const advisoryKev = new Map(opts.pack.advisories.map((a) => [a.id, a.kev]));
  const kevOf = (f: Finding) => advisoryKev.get(f.advisoryId) ?? false;
  const expected = opts.findings.filter((f) => f.confidence !== "fyi").slice(0, MAX_CHECKLIST).map((f) => f.id);
  const counts = expectedCounts(opts.findings);
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
      // gen_ai.chat span per Sentry's AI agent spec. Prompt and response text
      // are attached only when the caller enables content (demo, fixtures).
      const chatAttrs = {
        "gen_ai.operation.name": "chat", "gen_ai.provider.name": "ollama", "gen_ai.request.model": opts.model,
        "gen_ai.agent.name": "TwoToe", "gen_ai.request.temperature": 0.2, "gen_ai.request.seed": String(opts.seed ?? 42), "twotoe.attempt": attempt,
        ...(opts.traceContent ? {
          "gen_ai.system_instructions": SYSTEM,
          "gen_ai.input.messages": JSON.stringify([{ role: "user", parts: [{ type: "text", content: user }] }]),
        } : {}),
      };
      const res = await tracer.span("gen_ai.chat", `chat ${opts.model}`, chatAttrs, async (span) => {
        const r = await opts.client.chat({
          model: opts.model, system: SYSTEM, user, schema: BRIEF_DRAFT_SCHEMA, think: opts.think ?? false,
          ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
        });
        span.set("gen_ai.response.model", opts.model);
        if (r.promptEvalCount !== undefined) span.set("gen_ai.usage.input_tokens", r.promptEvalCount);
        if (r.evalCount !== undefined) span.set("gen_ai.usage.output_tokens", r.evalCount);
        if (r.promptEvalCount !== undefined && r.evalCount !== undefined) span.set("gen_ai.usage.total_tokens", r.promptEvalCount + r.evalCount);
        if (r.evalCount && r.evalDurationMs) span.set("gen_ai.response.tokens_per_second", r.evalCount / (r.evalDurationMs / 1000));
        if (opts.traceContent) span.set("gen_ai.output.messages", JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: r.content }] }]));
        return r;
      });
      Object.assign(log, {
        wallMs: res.wallMs,
        ...(res.promptEvalCount !== undefined ? { promptEvalCount: res.promptEvalCount } : {}),
        ...(res.evalCount !== undefined ? { evalCount: res.evalCount } : {}),
        ...(res.loadDurationMs !== undefined ? { loadDurationMs: res.loadDurationMs } : {}),
      });
      const toolAttrs = { "gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": "groundingValidator", "gen_ai.agent.name": "TwoToe", "twotoe.attempt": attempt };
      const outcome = await tracer.span("gen_ai.execute_tool", "execute_tool groundingValidator", toolAttrs, async (span) => {
        let json: unknown;
        try {
          json = JSON.parse(res.content);
        } catch {
          json = undefined;
        }
        const parsed = json === undefined ? null : BriefDraft.safeParse(json);
        let found: string[];
        let draft: BriefDraft | null = null;
        let v: Validation | null = null;
        if (!parsed) found = ["output is not valid JSON"];
        else if (!parsed.success) found = [`output does not match the schema (${shortZodError(parsed.error)})`];
        else {
          draft = normalize(parsed.data, expected, counts);
          v = validateDetailed(draft, opts.findings, kevOf);
          found = v.reasons;
        }
        // Demo traces only: reject a valid first draft so the retry shows up.
        if (opts.forceRejectFirst && attempt === 1) found = [...found, FORCED_REJECTION];
        span.set("twotoe.validator.rejections", found.length);
        span.set("gen_ai.tool.call.result", JSON.stringify(found.slice(0, 20)));
        if (found.length) span.fail("rejected");
        return { found, draft, v };
      });
      reasons = outcome.found;
      if (outcome.draft && outcome.v) {
        lastDraft = outcome.draft;
        lastValidation = outcome.v;
        if (reasons.length === 0) {
          base.attemptLog.push(log);
          return { ...base, draft: outcome.draft, mode: "llm", model: opts.model, attempts, rejections };
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

export const FORCED_REJECTION = "forced rejection for the demo trace (draft was otherwise checked as usual)";
