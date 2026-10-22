import { Brief, type Finding, type Inventory } from "@twotoe/core";
import type { BriefDraft } from "./draft";
import { isActionable, truncateWords } from "./template";

const MAX_LINE = 160;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
// The KEV feed request carries no user data (SPEC 10.7).
const NO_USER_DATA_HOSTS = new Set(["www.cisa.gov"]);

export type EgressRecord = Brief["meta"]["egress"][number];

// SPEC 10.7: line 1 and line 2 are assembled by code. Counts and timings
// never come from a writer.
export function assembleLines(
  draft: BriefDraft,
  findings: Finding[],
  ctx: { checksRun: number; durationMs: number; egress: EgressRecord[] },
): { line1: string; line2: string } {
  const actionable = findings.filter(isActionable);
  const n = actionable.length;
  const head = `${n} thing${n > 1 ? "s" : ""} need${n > 1 ? "" : "s"} you today: `;
  const withActions = (k: number) => head
    + draft.line1Actions.slice(0, k).join("; ")
    + (n > k ? `; +${n - k} more in the checklist.` : ".");
  let line1 = "Nothing needs you today.";
  if (n > 0) {
    line1 = withActions(Math.min(2, n, draft.line1Actions.length));
    if (line1.length > MAX_LINE) line1 = withActions(1);
    if (line1.length > MAX_LINE) line1 = `${n} thing${n > 1 ? "s" : ""} need${n > 1 ? "" : "s"} you today; see the checklist.`;
  }

  // "0.0s" reads like a bug on tiny fixture runs, so show two decimals under 0.1s.
  const secs = (ctx.durationMs / 1000).toFixed(ctx.durationMs < 100 ? 2 : 1);
  const left = ctx.egress.filter((e) => !LOCAL_HOSTS.has(e.host) && !NO_USER_DATA_HOSTS.has(e.host));
  const leftClause = left.length === 0
    ? "0 secrets left this machine."
    : `data went to ${[...new Set(left.map((e) => e.host))].join(", ")} (${left.reduce((s, e) => s + e.bytesOut, 0)} bytes).`;
  const tail = truncateWords(draft.line2Tail.replace(/[.\s]+$/, ""), 60) || "you're fine";
  let line2 = `Everything else: ${tail}. Checked ${ctx.checksRun} things in ${secs}s, ${leftClause}`;
  if (line2.length > MAX_LINE) line2 = `Everything else: you're fine. Checked ${ctx.checksRun} things in ${secs}s, ${leftClause}`;
  return { line1, line2: truncateWords(line2, MAX_LINE) };
}

export function localDate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface BuildBriefInput {
  draft: BriefDraft;
  findings: Finding[];
  inventory: Inventory;
  now: Date;
  durationMs: number;
  egress?: EgressRecord[];
  mode: Brief["meta"]["mode"];
  model?: string | null;
  attempts?: number;
  validatorRejections?: string[];
}

// Draft + computed numbers -> a Brief that passes the zod contract.
export function buildBrief(input: BuildBriefInput): Brief {
  const egress = input.egress ?? [];
  const { line1, line2 } = assembleLines(input.draft, input.findings, {
    checksRun: input.inventory.checksRun, durationMs: input.durationMs, egress,
  });
  return Brief.parse({
    date: localDate(input.now),
    line1,
    line2,
    checklist: input.draft.checklist,
    fyi: input.draft.fyi,
    meta: {
      mode: input.mode,
      model: input.model ?? null,
      attempts: input.attempts ?? 0,
      validatorRejections: input.validatorRejections ?? [],
      durationMs: input.durationMs,
      egress,
    },
  });
}
