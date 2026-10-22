import type { Advisory, AdvisoryPack, Finding } from "@twotoe/core";
import { templateActions, MAX_CHECKLIST } from "./template";

export const PROMPT_VERSION = "2026-10-22.1";

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

// SPEC 10.4 few-shot (SHOULD), included in the system prompt.
const FEW_SHOT = `Example.
Input: one definite Node finding (24.22.0 -> 24.22.1) and one possible OpenCode finding.
Output:
{
  "line1Actions": ["bump Node to 24.22.1"],
  "line2Tail": "go back to sleep",
  "checklist": [
    { "findingId": "nodejs-2026-10-21:a1", "action": "Upgrade Node from 24.22.0 to 24.22.1",
      "why": "The Oct 21 Node release fixes a Brotli decoder bug and a TLS hostname check bypass." },
    { "findingId": "opencode-console-2026-10-17:b2", "action": "Confirm whether you linked API keys in OpenCode Console",
      "why": "OpenCode disclosed that Console provider keys were exposed for some users; revoke them if you linked any." }
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
    evidence: f.evidence.map((e) => ({ location: relativeLocation(e.location, roots) })),
    allowedTokens: f.allowedTokens,
  };
}

// SPEC 10.3.
export function buildUserPrompt(findings: Finding[], pack: AdvisoryPack, date: string, roots: string[], rejected: string[] = []): string {
  const byId = new Map(pack.advisories.map((a) => [a.id, a]));
  const items = findings.filter((f) => f.confidence !== "fyi").slice(0, MAX_CHECKLIST);
  const fyi = findings.filter((f) => f.confidence === "fyi").slice(0, 3);
  const json = (list: Finding[]) => JSON.stringify(list.map((f) => modelFinding(f, byId.get(f.advisoryId)!, roots)), null, 2);
  let prompt = `DATE: ${date}
FINDINGS (ordered by priority, already verified):
${json(items)}

FYI (awareness only, never actions):
${json(fyi)}`;
  if (rejected.length) {
    prompt += `\n\nYour previous draft was rejected for:\n${rejected.map((r) => `- ${r}`).join("\n")}\nFix every item and output the full JSON again.`;
  }
  return prompt;
}
