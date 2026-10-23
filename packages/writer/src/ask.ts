import type { AdvisoryPack, Finding } from "@twotoe/core";
import type { ModelClient } from "./ollama";
import { modelFinding } from "./prompts";
import { templateActions } from "./template";
import { extractRiskyTokens, hypeWordsIn, normToken } from "./tokens";

// SPEC 2.3 story 10 / 11.7: a follow-up question ("why does the Node one
// matter?") answered only from tonight's findings, through the same grounding
// rule as the brief. Built on TwoToe's own stack (local Ollama + validator),
// not Mastra: @mastra/core 1.79.0 sends usage telemetry to us.posthog.com by
// default and reads MASTRA_* env values (CLAUDE.md rules 1 and 4).
// Context is the "tool output" of getFinding / listFindings / getAdvisory,
// computed by code up front; the model gets no filesystem and no web.

export const MAX_ANSWER = 500;
export const DONT_KNOW = "I only know what tonight's scan found, and that does not answer this. The vendor advisory is the source of truth.";

export const ASK_SYSTEM = `You are TwoToe, a calm morning security assistant. A developer asks a follow-up
question about this morning's brief. You receive FINDINGS that code already verified.

Rules:
1. Answer ONLY from FINDINGS. Never add a CVE ID, version number, vendor, product,
   date, or count that is not in the allowedTokens of a finding you cite.
2. List every finding you used in "findingIds". Never invent ids.
3. If FINDINGS do not answer the question, set "answer" to exactly:
   "${DONT_KNOW}" and "findingIds" to [].
4. Plain words, at most 3 sentences, at most ${MAX_ANSWER} characters. No markdown.
5. No hype words (critical, urgent, devastating, catastrophic, broke, nightmare,
   actively, exploited) unless a cited finding has severity "critical" (then
   "critical" is allowed) or kev true (then "actively exploited" is allowed).
6. Output JSON matching the schema. No extra keys.`;

export const ASK_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    findingIds: { type: "array", items: { type: "string" } },
  },
  required: ["answer", "findingIds"],
  additionalProperties: false,
} as const;

export interface AskDraft { answer: string; findingIds: string[] }

export function askContext(findings: Finding[], pack: AdvisoryPack): object[] {
  return findings.flatMap((f) => {
    const a = pack.advisories.find((x) => x.id === f.advisoryId);
    if (!a) return [];
    // Saved findings are already redacted to ~; roots [] keeps the last 3 path parts.
    return [{ ...modelFinding(f, a, []), summary: a.summary, sources: a.sourceUrls }];
  });
}

export function askUserPrompt(question: string, findings: Finding[], pack: AdvisoryPack, rejected: string[] = []): string {
  const parts = [`QUESTION: ${question.trim().slice(0, 500)}`, "", "FINDINGS:", JSON.stringify(askContext(findings, pack), null, 2)];
  if (rejected.length) parts.push("", `Your previous answer was rejected for: ${rejected.join("; ")}. Fix exactly these problems.`);
  return parts.join("\n");
}

// Same walls as the brief validator: known ids, grounded tokens, gated hype words.
export function validateAnswer(draft: AskDraft, findings: Finding[], kevOf: (f: Finding) => boolean): string[] {
  const reasons: string[] = [];
  const byId = new Map(findings.map((f) => [f.id, f]));
  const answer = draft.answer.trim();
  if (!answer) reasons.push("empty answer");
  if (answer.length > MAX_ANSWER) reasons.push(`answer over ${MAX_ANSWER} characters`);
  if (answer === DONT_KNOW) return draft.findingIds.length ? ["the don't-know answer must cite no findings"] : reasons;
  const cited: Finding[] = [];
  for (const id of draft.findingIds) {
    const f = byId.get(id);
    if (f) cited.push(f);
    else reasons.push(`unknown findingId ${id}`);
  }
  if (cited.length === 0) reasons.push("no finding cited");
  const allowed = new Set(cited.flatMap((f) => f.allowedTokens.map(normToken)));
  for (const tok of extractRiskyTokens(answer)) if (!allowed.has(normToken(tok))) reasons.push(`ungrounded token "${tok}"`);
  const critical = cited.some((f) => f.severity === "critical");
  const kev = cited.some(kevOf);
  for (const w of hypeWordsIn(answer)) {
    const ok = (w === "critical" && critical) || ((w === "actively" || w === "exploited") && kev);
    if (!ok) reasons.push(`hype word "${w}"`);
  }
  return reasons;
}

function parseDraft(content: string): AskDraft | null {
  try {
    const j = JSON.parse(content) as Partial<AskDraft>;
    if (typeof j.answer !== "string" || !Array.isArray(j.findingIds)) return null;
    return { answer: j.answer, findingIds: j.findingIds.filter((x): x is string => typeof x === "string") };
  } catch {
    return null;
  }
}

// No model, or two rejected drafts: say what code knows about the findings the
// question names (by vendor or advisory id), else list tonight's findings.
export function templateAnswer(question: string, findings: Finding[], pack: AdvisoryPack): AskDraft {
  const q = question.toLowerCase();
  const hits = findings.filter((f) => {
    const a = pack.advisories.find((x) => x.id === f.advisoryId);
    const words = [a?.vendor, f.advisoryId.split("-")[0], ...((a?.check.params.tokens as string[] | undefined) ?? [])];
    return words.some((w) => w && w.length > 2 && q.includes(w.toLowerCase()));
  });
  if (hits.length === 0) {
    if (findings.length === 0) return { answer: "Tonight's scan found nothing to explain.", findingIds: [] };
    const titles = findings.map((f) => pack.advisories.find((a) => a.id === f.advisoryId)?.title ?? f.advisoryId);
    return { answer: `I can only answer about tonight's findings: ${titles.join("; ")}.`.slice(0, MAX_ANSWER), findingIds: [] };
  }
  const f = hits[0]!;
  const a = pack.advisories.find((x) => x.id === f.advisoryId)!;
  return { answer: `${a.summary} What to do: ${templateActions(f, a).action}.`.replace(/\.\./g, ".").slice(0, MAX_ANSWER), findingIds: [f.id] };
}

export interface AskResult {
  answer: string;
  findingIds: string[];
  mode: "llm" | "template";
  attempts: number;
  rejections: string[];
}

export async function askQuestion(opts: {
  question: string; findings: Finding[]; pack: AdvisoryPack; client: ModelClient; model: string;
}): Promise<AskResult> {
  const { question, findings, pack } = opts;
  const kevOf = (f: Finding) => pack.advisories.find((a) => a.id === f.advisoryId)?.kev ?? false;
  const rejections: string[] = [];
  let attempts = 0;
  if (findings.length > 0) {
    let last: string[] = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      attempts = attempt;
      let content: string;
      try {
        content = (await opts.client.chat({ model: opts.model, system: ASK_SYSTEM, user: askUserPrompt(question, findings, pack, last), schema: ASK_SCHEMA })).content;
      } catch {
        rejections.push(`attempt ${attempt}: model call failed`);
        break;
      }
      const draft = parseDraft(content);
      const reasons = draft ? validateAnswer(draft, findings, kevOf) : ["not valid JSON for the schema"];
      if (draft && reasons.length === 0) return { ...draft, answer: draft.answer.trim(), mode: "llm", attempts, rejections };
      for (const r of reasons) rejections.push(`attempt ${attempt}: ${r}`);
      last = reasons;
    }
  }
  return { ...templateAnswer(question, findings, pack), mode: "template", attempts, rejections };
}
