import type { Finding } from "@twotoe/core";
import type { BriefDraft } from "./draft";
import { isActionable, MAX_ACTION, MAX_CHECKLIST, MAX_FYI, MAX_LINE1_ACTION, MAX_WHY } from "./template";
import { extractRiskyTokens, hypeWordsIn, normToken } from "./tokens";

// SPEC 10.5: the grounding validator. Pure. Rejects anything the writer said
// that the matcher did not establish.

export interface Validation {
  reasons: string[];
  badItems: Set<string>;     // checklist findingIds whose text failed
  missing: string[];         // findings the checklist must cover but does not
  line1Bad: boolean;
  tailBad: boolean;
  fyiBad: boolean;
}

function allowedSet(findings: Finding[]): Set<string> {
  return new Set(findings.flatMap((f) => f.allowedTokens.map(normToken)));
}

function ungrounded(text: string, allowed: Set<string>): string[] {
  return extractRiskyTokens(text).filter((t) => !allowed.has(normToken(t)));
}

// Hype words allowed by SPEC 10.2 rule 4 for this set of findings.
function badHype(text: string, findings: Finding[], kevOf: (f: Finding) => boolean): string[] {
  return hypeWordsIn(text).filter((w) => {
    if (w === "critical") return !findings.some((f) => f.severity === "critical");
    if (w === "actively" || w === "exploited") return !findings.some(kevOf);
    return true;
  });
}

export function validateDetailed(draft: BriefDraft, findings: Finding[], kevOf: (f: Finding) => boolean): Validation {
  const reasons: string[] = [];
  const badItems = new Set<string>();
  const byId = new Map(findings.map((f) => [f.id, f]));
  const expected = findings.filter((f) => f.confidence !== "fyi").slice(0, MAX_CHECKLIST);
  const expectedIds = new Set(expected.map((f) => f.id));

  // 1. ids
  const seen = new Map<string, number>();
  for (const item of draft.checklist) {
    seen.set(item.findingId, (seen.get(item.findingId) ?? 0) + 1);
    const f = byId.get(item.findingId);
    if (!f) reasons.push(`unknown findingId ${item.findingId}`);
    else if (f.confidence === "fyi") reasons.push(`FYI finding ${item.findingId} placed in the checklist`);
    else if (!expectedIds.has(item.findingId)) reasons.push(`finding ${item.findingId} is beyond the ${MAX_CHECKLIST}-item checklist`);
  }
  for (const [id, n] of seen) {
    if (n > 1) {
      reasons.push(`duplicate findingId ${id}`);
      badItems.add(id);
    }
  }

  // 2. coverage: every definite/likely/possible finding in the checklist exactly once
  const missing = expected.filter((f) => !seen.has(f.id)).map((f) => f.id);
  for (const id of missing) reasons.push(`missing finding ${id}`);

  // 3-6. per-item grounding, hype words, Confirm rule, length caps
  for (const item of draft.checklist) {
    const f = byId.get(item.findingId);
    if (!f || !expectedIds.has(f.id)) continue;
    const before = reasons.length;
    const action = item.action.trim();
    const why = item.why.trim();
    const allowed = allowedSet([f]);
    for (const tok of ungrounded(`${action} ${why}`, allowed)) reasons.push(`ungrounded token "${tok}" in ${f.id}`);
    for (const w of badHype(`${action} ${why}`, [f], kevOf)) reasons.push(`hype word "${w}" not allowed in ${f.id}`);
    if (f.confidence === "possible" && !/^Confirm\b/.test(action)) reasons.push(`possible finding ${f.id} must start with "Confirm"`);
    if (!action) reasons.push(`empty action in ${f.id}`);
    if (!why) reasons.push(`empty why in ${f.id}`);
    if (action.length > MAX_ACTION) reasons.push(`action over ${MAX_ACTION} characters in ${f.id}`);
    if (why.length > MAX_WHY) reasons.push(`why over ${MAX_WHY} characters in ${f.id}`);
    if (reasons.length > before) badItems.add(f.id);
  }

  // 7. line1Actions: right count, grounded in the top-2 actionable findings
  const top = expected.filter(isActionable).slice(0, 2);
  let line1Bad = false;
  if (draft.line1Actions.length !== top.length) {
    reasons.push(`line1Actions has ${draft.line1Actions.length} item(s), expected ${top.length}`);
    line1Bad = true;
  }
  const topAllowed = allowedSet(top);
  for (const a of draft.line1Actions) {
    for (const tok of ungrounded(a, topAllowed)) { reasons.push(`ungrounded token "${tok}" in line1Actions`); line1Bad = true; }
    for (const w of badHype(a, top, kevOf)) { reasons.push(`hype word "${w}" in line1Actions`); line1Bad = true; }
    if (a.trim().length > MAX_LINE1_ACTION) { reasons.push(`line1 action over ${MAX_LINE1_ACTION} characters`); line1Bad = true; }
    if (!a.trim()) { reasons.push("empty line1 action"); line1Bad = true; }
  }

  // 8. line2Tail: no digits (and no other risky token: the tail claims nothing specific)
  let tailBad = false;
  const tail = draft.line2Tail.trim();
  if (/\d/.test(tail)) { reasons.push("digits in line2Tail"); tailBad = true; }
  for (const tok of extractRiskyTokens(tail).filter((t) => !/\d/.test(t))) { reasons.push(`line2Tail mentions "${tok}"`); tailBad = true; }
  for (const w of hypeWordsIn(tail)) { reasons.push(`hype word "${w}" in line2Tail`); tailBad = true; }
  if (tail.length > 60) { reasons.push("line2Tail over 60 characters"); tailBad = true; }
  if (!tail) { reasons.push("empty line2Tail"); tailBad = true; }

  // FYI: one calm line per FYI finding, grounded in those findings
  let fyiBad = false;
  const fyiFindings = findings.filter((f) => f.confidence === "fyi").slice(0, 3);
  if (draft.fyi.length !== fyiFindings.length) {
    reasons.push(`fyi has ${draft.fyi.length} line(s), expected ${fyiFindings.length}`);
    fyiBad = true;
  }
  const fyiAllowed = allowedSet(fyiFindings);
  for (const line of draft.fyi) {
    for (const tok of ungrounded(line, fyiAllowed)) { reasons.push(`ungrounded token "${tok}" in fyi`); fyiBad = true; }
    for (const w of badHype(line, fyiFindings, kevOf)) { reasons.push(`hype word "${w}" in fyi`); fyiBad = true; }
    if (line.trim().length > MAX_FYI) { reasons.push(`fyi line over ${MAX_FYI} characters`); fyiBad = true; }
  }

  return { reasons, badItems, missing, line1Bad, tailBad, fyiBad };
}

// SPEC 10.5 signature: rejection reasons only.
export function validate(draft: BriefDraft, findings: Finding[], kevOf: (f: Finding) => boolean = () => false): string[] {
  return validateDetailed(draft, findings, kevOf).reasons;
}
