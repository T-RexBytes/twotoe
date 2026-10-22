import type { Confidence, Severity } from "../schemas";

// SPEC 7.4. Lower = more urgent.
const BASE: Record<Severity, number> = { critical: 100, high: 200, medium: 300, info: 900 };
const CONFIDENCE_BONUS: Record<Confidence, number> = { definite: 30, likely: 15, possible: 0, fyi: -500 };
const DAY_MS = 24 * 60 * 60 * 1000;

// A leaked key is being used right now; a patch gap is only being scanned for.
export const CREDENTIAL_ADVISORIES = new Set(["railway-2026-10-21", "opencode-console-2026-10-17", "litellm-1.107.0"]);

export function priority(input: {
  severity: Severity;
  kev: boolean;
  kevDueDate: string | null;
  confidence: Confidence;
  now: Date;
}): number {
  let kevBonus = 0;
  if (input.kev) {
    kevBonus = 50;
    if (input.kevDueDate) {
      const due = Date.parse(`${input.kevDueDate}T23:59:59Z`);
      // Due within 3 days, or already overdue.
      if (!Number.isNaN(due) && due - input.now.getTime() <= 3 * DAY_MS) kevBonus += 25;
    }
  }
  return BASE[input.severity] - kevBonus - CONFIDENCE_BONUS[input.confidence];
}

// Sort order: priority, then credential-exposure before patch advisories, then id for stability.
export function compareFindings(a: { priority: number; advisoryId: string; id: string }, b: { priority: number; advisoryId: string; id: string }): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const ca = CREDENTIAL_ADVISORIES.has(a.advisoryId) ? 0 : 1;
  const cb = CREDENTIAL_ADVISORIES.has(b.advisoryId) ? 0 : 1;
  if (ca !== cb) return ca - cb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
