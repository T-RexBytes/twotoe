import type { Advisory, AdvisoryPack, Finding } from "@twotoe/core";
import type { BriefDraft } from "./draft";

// SPEC 10.6. Fully deterministic, no model: the fallback and the eval baseline.

export const MAX_ACTION = 90;
export const MAX_WHY = 140;
export const MAX_LINE1_ACTION = 60;
export const MAX_FYI = 160;
export const MAX_CHECKLIST = 7;
export const MAX_FYI_ITEMS = 3;

// Cuts at a word boundary and adds "..." so the result fits in `max`.
export function truncateWords(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const room = t.slice(0, max - 3);
  const cut = room.lastIndexOf(" ");
  return `${(cut > max / 2 ? room.slice(0, cut) : room).replace(/[\s,;:.]+$/, "")}...`;
}

export function fill(template: string, vars: Finding["vars"]): string {
  return template.replace(/\{found\}/g, vars?.found ?? "").replace(/\{fixed\}/g, vars?.fixed ?? "").replace(/\s{2,}/g, " ").trim();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")}${parts.length > 2 ? "," : ""} and ${parts[parts.length - 1]}`;
}

interface Variant { action: string; shortAction?: string }

// The action and line-1 action for one finding, from its advisory and the
// variant the matcher chose. Possible findings always start with "Confirm".
export function templateActions(finding: Finding, advisory: Advisory): { action: string; shortAction: string } {
  const params = advisory.check.params as { variants?: Record<string, Variant>; actionParts?: Record<string, string> };
  const variant = finding.vars?.variant;
  let action = advisory.action;
  let short = advisory.shortAction ?? lowerFirst(advisory.action);
  const v = variant ? params.variants?.[variant] : undefined;
  if (v) {
    action = v.action;
    short = v.shortAction ?? lowerFirst(v.action);
  } else if (variant && params.actionParts) {
    // e.g. "certifi+git" -> "Update certifi and Git for Windows"
    const parts = variant.split("+").map((k) => params.actionParts![k]).filter((x): x is string => Boolean(x));
    if (parts.length) {
      short = `update ${joinParts(parts)}`;
      action = capitalize(short);
    }
  }
  action = fill(action, finding.vars);
  short = fill(short, finding.vars);
  if (finding.confidence === "possible" && !/^confirm\b/i.test(action)) action = `Confirm whether to ${lowerFirst(action)}`;
  return { action: truncateWords(action, MAX_ACTION), shortAction: truncateWords(lowerFirst(short), MAX_LINE1_ACTION) };
}

export function isActionable(f: Finding): boolean {
  return f.confidence === "definite" || f.confidence === "likely";
}

export function templateDraft(findings: Finding[], pack: AdvisoryPack): BriefDraft {
  const byId = new Map(pack.advisories.map((a) => [a.id, a]));
  const advisoryOf = (f: Finding) => {
    const a = byId.get(f.advisoryId);
    if (!a) throw new Error(`finding for unknown advisory ${f.advisoryId}`);
    return a;
  };
  const items = findings.filter((f) => f.confidence !== "fyi").slice(0, MAX_CHECKLIST);
  const checklist = items.map((f) => {
    const a = advisoryOf(f);
    return { findingId: f.id, action: templateActions(f, a).action, why: truncateWords(a.summary, MAX_WHY) };
  });
  const line1Actions = items.filter(isActionable).slice(0, 2).map((f) => templateActions(f, advisoryOf(f)).shortAction);
  const fyi = findings.filter((f) => f.confidence === "fyi").slice(0, MAX_FYI_ITEMS).map((f) => {
    const a = advisoryOf(f);
    const text = (a.check.params as { fyi?: string }).fyi ?? a.summary;
    return truncateWords(text, MAX_FYI);
  });
  return { line1Actions, line2Tail: "you're fine", checklist, fyi };
}
