import type { Advisory, AdvisoryPack, Finding } from "@twotoe/core";
import { MAX_CHECKLIST, MAX_WHY, templateActions, truncateWords } from "./template";

export const PROMPT_VERSION = "2026-10-22.2";

// SPEC 10.2, verbatim.
const RULES = `You are TwoToe, a calm morning security assistant. You write for a tired developer
who just woke up. You will receive a JSON list of FINDINGS that were already verified
by code. Your only job is to phrase them.

Rules:
1. Use ONLY facts present in FINDINGS. Never add a CVE ID, version number, vendor,
   product, date, or count that is not in that finding's allowedTokens.
2. One checklist item per finding id, in the given order. Never invent finding ids.
3. "action" is an imperative instruction, max 90 characters, starting with a verb.
4. "why" is one plain sentence, max 140 characters, no hype words
   (no: critical, urgent, devastating, catastrophic, broke, nightmare, actively,
    exploited) UNLESS the finding's severity is "critical" (then "critical" is allowed)
   or kev is true (then "actively exploited" is allowed).
5. For confidence "possible", start the action with "Confirm".
6. line1Actions: the two highest-priority actions, each max 60 characters, lowercase start.
7. line2Tail: max 60 characters, reassuring, no numbers.
8. fyi: rephrase each FYI finding in one calm sentence, max 160 characters.
9. Output JSON matching the schema. No markdown. No extra keys.`;

// SPEC 10.4 few-shot (SHOULD), with made-up findings: the spec version used real
// Node/OpenCode facts and ids, and models copied them into other briefs (eval, Oct 22).
const FEW_SHOT = `Example.
Input: one definite examplelib finding (2.0.1 -> 2.0.2) and one possible ExampleCloud finding.
These findings are made up. Never copy the example's ids, versions or wording into your answer.
Output:
{
  "line1Actions": ["bump examplelib to 2.0.2"],
  "line2Tail": "go back to sleep",
  "checklist": [
    { "findingId": "EXAMPLE-ID-1", "action": "Upgrade examplelib from 2.0.1 to 2.0.2",
      "why": "The examplelib release fixes a parser bug that could crash the service." },
    { "findingId": "EXAMPLE-ID-2", "action": "Confirm whether you linked API keys in ExampleCloud",
      "why": "ExampleCloud said some saved keys may have been exposed; revoke them if you linked any." }
  ],
  "fyi": []
}
Note: line 1 only lists the definite/likely action. The possible item stays in the checklist.`;

export const SYSTEM = `${RULES}\n\n${FEW_SHOT}`;

// Evidence locations go to the model project-relative, never with a home
// path: "~\code\rail\.env" under root "~\code" -> "rail\.env".
export function relativeLocation(location: string, roots: string[]): string {
  const prefixed = location.match(/^([a-z][a-z-]+:)(.+)$/i);   // "certifi:~\...", not "C:\..."
  if (prefixed && /^[~\\/]|^[A-Za-z]:/.test(prefixed[2]!)) return prefixed[1]! + relativeLocation(prefixed[2]!, roots);
  const lower = location.toLowerCase();
  for (const r of roots) {
    const rl = r.toLowerCase();
    if (lower.startsWith(rl) && /^[\\/]/.test(location.slice(r.length))) return location.slice(r.length + 1);
  }
  if (/^~|^[A-Za-z]:[\\/]|^[\\/]/.test(location)) {
    const parts = location.split(/[\\/]/).filter(Boolean);
    return parts.slice(-3).join("\\");
  }
  return location;
}

// SPEC 6 rule: the model sees only these fields. No raw file contents, no
// home paths, no env key lists beyond the matched ones (which are in
// allowedTokens). `kev` is added because rule 4 refers to it.
export function modelFinding(f: Finding, a: Advisory, roots: string[]) {
  return {
    id: f.id,
    advisoryId: f.advisoryId,
    confidence: f.confidence,
    severity: f.severity,
    kev: a.kev,
    title: a.title,
    vendor: a.vendor,
    action: templateActions(f, a).action,
    summary: a.summary,
    // Most pack summaries run past the 140-char "why" cap and models copy them
    // (eval, Oct 22: 118 rejections). This is the template's word-boundary cut.
    suggestedWhy: truncateWords(a.summary, MAX_WHY),
    evidence: f.evidence.map((e) => ({ location: relativeLocation(e.location, roots) })),
    allowedTokens: f.allowedTokens,
  };
}

// How many line-1 actions and FYI lines a correct draft has (the validator expects these).
export function expectedCounts(findings: Finding[]): { line1: number; fyi: number } {
  const items = findings.filter((f) => f.confidence !== "fyi").slice(0, MAX_CHECKLIST);
  return {
    line1: Math.min(2, items.filter((f) => f.confidence === "definite" || f.confidence === "likely").length),
    fyi: Math.min(3, findings.filter((f) => f.confidence === "fyi").length),
  };
}

// SPEC 10.3, plus an explicit WRITE block with the exact counts (eval fix).
export function buildUserPrompt(findings: Finding[], pack: AdvisoryPack, date: string, roots: string[], rejected: string[] = []): string {
  const byId = new Map(pack.advisories.map((a) => [a.id, a]));
  const items = findings.filter((f) => f.confidence !== "fyi").slice(0, MAX_CHECKLIST);
  const fyi = findings.filter((f) => f.confidence === "fyi").slice(0, 3);
  const json = (list: Finding[]) => JSON.stringify(list.map((f) => modelFinding(f, byId.get(f.advisoryId)!, roots)), null, 2);
  const counts = expectedCounts(findings);
  let prompt = `DATE: ${date}
FINDINGS (ordered by priority, already verified):
${json(items)}

FYI (awareness only, never actions):
${json(fyi)}

WRITE:
- checklist: exactly ${items.length} item(s), one per finding id above, in the same order.
- line1Actions: exactly ${counts.line1} item(s), for the highest-priority definite/likely findings.
- fyi: exactly ${counts.fyi} item(s).
- why: at most ${MAX_WHY} characters; each finding's suggestedWhy already fits.`;
  if (rejected.length) {
    prompt += `\n\nYour previous draft was rejected for:\n${rejected.map((r) => `- ${r}`).join("\n")}\nFix every item and output the full JSON again.`;
  }
  return prompt;
}
