import pc from "picocolors";
import {
  loadKevSnapshot, loadPack, matchAll, redactText, type Brief, type Finding,
} from "@twotoe/core";
import { buildBrief, evidenceSummary, templateDraft } from "@twotoe/writer";
import { collect, warnIfSelfUnpatched, type CollectOptions } from "./scan";

export const EXIT_NOTHING = 0;
export const EXIT_ACTIONS = 10;
export const EXIT_ERROR = 2;

export interface BriefCommandOptions extends CollectOptions {
  llm?: boolean;        // commander sets false for --no-llm
  json?: boolean;
  region?: string;
  offline?: boolean;
  now?: Date;
}

export interface BriefResult {
  brief: Brief;
  findings: Finding[];
  exitCode: number;
}

export async function makeBrief(rootsArg: string[], opts: BriefCommandOptions): Promise<BriefResult> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const { result, config } = await collect(rootsArg, opts);
  const pack = loadPack();
  const findings = matchAll(result.inventory, pack, {
    region: opts.region ?? config.region ?? null,
    now,
    kev: loadKevSnapshot(),
  });
  const draft = templateDraft(findings, pack);
  const brief = buildBrief({
    draft, findings, inventory: result.inventory, now,
    durationMs: Date.now() - started,
    egress: [],            // no network in template mode; the guarded ledger arrives in Phase 3
    mode: "template",
  });
  const actionable = findings.some((f) => f.confidence === "definite" || f.confidence === "likely");
  return { brief, findings, exitCode: actionable ? EXIT_ACTIONS : EXIT_NOTHING };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function headerDate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fit(s: string, width: number): string {
  return s.length > width ? `${s.slice(0, width - 3)}...` : s.padEnd(width);
}

const CONF_COLOR: Record<string, (s: string) => string> = {
  definite: pc.red, likely: pc.yellow, possible: pc.cyan, fyi: pc.dim,
};

// The SPEC 12 terminal layout.
export function renderBrief({ brief, findings }: Omit<BriefResult, "exitCode">, now: Date, color = true): string {
  const c = color ? pc : { bold: (s: string) => s, dim: (s: string) => s, red: (s: string) => s, green: (s: string) => s };
  const byId = new Map(findings.map((f) => [f.id, f]));
  const out: string[] = [];
  out.push(`  ${c.bold("twotoe")}  ${headerDate(now)}`, "");
  const hasActions = !brief.line1.startsWith("Nothing");
  out.push(`  ${hasActions ? c.bold(c.red(brief.line1)) : c.bold(c.green(brief.line1))}`);
  out.push(`  ${c.dim(brief.line2)}`, "");
  brief.checklist.forEach((item, i) => {
    const f = byId.get(item.findingId);
    const conf = f?.confidence ?? "";
    const confText = fit(conf, 9);
    const colored = color && CONF_COLOR[conf] ? CONF_COLOR[conf]!(confText) : confText;
    out.push(`  [ ] ${String(i + 1).padEnd(2)} ${fit(item.action, 46)}  ${colored} ${f ? evidenceSummary(f) : ""}`);
  });
  if (brief.checklist.length) out.push("");
  for (const line of brief.fyi) out.push(`  ${c.bold("FYI")}  ${line}`);
  if (brief.fyi.length) out.push("");
  const m = brief.meta;
  const model = m.model ? `model: ${m.model}` : "model: none (--no-llm)";
  const validator = m.mode === "template" ? "validator: not needed" : `validator: ${m.validatorRejections.length} rejection(s)`;
  out.push(c.dim(`  card: twotoe card (not built yet)   ${model}   ${validator}`));
  return out.join("\n");
}

export async function runBrief(rootsArg: string[], opts: BriefCommandOptions): Promise<number> {
  if (opts.llm !== false) {
    process.stderr.write("twotoe: the local model writer arrives in Phase 3. Run `twotoe brief --no-llm` for now.\n");
    return EXIT_ERROR;
  }
  warnIfSelfUnpatched();
  const now = opts.now ?? new Date();
  const res = await makeBrief(rootsArg, { ...opts, now });
  const text = opts.json
    ? JSON.stringify({ brief: res.brief, findings: res.findings }, null, 2)
    : renderBrief(res, now, process.stdout.isTTY === true);
  process.stdout.write(redactText(text) + "\n");
  return res.exitCode;
}
