import pc from "picocolors";
import {
  installEgressGuard, Ledger, loadKevSnapshot, loadPack, matchAll, redactText, twotoeHome, type Brief, type Finding,
} from "@twotoe/core";
import {
  buildBrief, evidenceSummary, localDate, OllamaClient, resolveModel, templateDraft, writeDraft,
  type ModelClient, type WriteResult,
} from "@twotoe/writer";
import { persistBrief } from "@twotoe/worker";
import { collect, warnIfSelfUnpatched, type CollectOptions } from "./scan";

export const EXIT_NOTHING = 0;
export const EXIT_ACTIONS = 10;
export const EXIT_ERROR = 2;

export interface BriefCommandOptions extends CollectOptions {
  llm?: boolean;        // commander sets false for --no-llm
  json?: boolean;
  region?: string;
  offline?: boolean;
  model?: string;
  save?: boolean;
  now?: Date;
  client?: ModelClient; // tests inject a fake
}

export interface BriefResult {
  brief: Brief;
  findings: Finding[];
  exitCode: number;
  run: Omit<WriteResult, "draft"> | null;
}

export async function makeBrief(rootsArg: string[], opts: BriefCommandOptions): Promise<BriefResult> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const ledger = new Ledger();
  // All network goes through the guard, template mode included (CLAUDE.md rule 4).
  const uninstall = installEgressGuard({ ledger, offline: opts.offline === true });
  try {
    const { result, config } = await collect(rootsArg, opts);
    const pack = loadPack();
    const findings = matchAll(result.inventory, pack, {
      region: opts.region ?? config.region ?? null,
      now,
      kev: loadKevSnapshot(),
    });

    let run: BriefResult["run"] = null;
    let draft = templateDraft(findings, pack);
    let mode: Brief["meta"]["mode"] = "template";
    let model: string | null = null;
    let attempts = 0;
    let rejections: string[] = [];
    if (opts.llm !== false) {
      const w = await writeDraft({
        findings, pack, date: localDate(now), roots: result.inventory.roots,
        client: opts.client ?? new OllamaClient(),
        model: resolveModel({ flag: opts.model, config: config.model }),
      });
      ({ draft, mode, model, attempts, rejections } = w);
      const { draft: _d, ...rest } = w;
      run = rest;
    }

    const brief = buildBrief({
      draft, findings, inventory: result.inventory, now,
      durationMs: Date.now() - started,
      egress: ledger.entries(),
      mode, model, attempts, validatorRejections: rejections,
    });
    const actionable = findings.some((f) => f.confidence === "definite" || f.confidence === "likely");
    return { brief, findings, run, exitCode: actionable ? EXIT_ACTIONS : EXIT_NOTHING };
  } finally {
    uninstall();
  }
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

export function validatorSummary(brief: Brief, run: BriefResult["run"]): string {
  const m = brief.meta;
  const n = m.validatorRejections.length;
  const rej = `${n} rejection${n === 1 ? "" : "s"}`;
  if (m.mode === "template") return m.model === null && !run ? "validator: not needed" : "validator: nothing to check";
  if (m.mode === "llm") return m.attempts > 1 ? `validator: ${rej}, fixed on retry` : `validator: ${rej}`;
  const parts = run?.fallbackParts ?? [];
  return parts.includes("all") ? `validator: ${rej}, template used for everything` : `validator: ${rej}, template used for ${parts.length} part(s)`;
}

// The SPEC 12 terminal layout.
export function renderBrief({ brief, findings, run }: Omit<BriefResult, "exitCode">, now: Date, color = true): string {
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
  const model = m.model ? `model: ${m.model} (${m.mode})` : "model: none (template)";
  out.push(c.dim(`  card: twotoe card (not built yet)   ${model}   ${validatorSummary(brief, run)}`));
  return out.join("\n");
}

export async function runBrief(rootsArg: string[], opts: BriefCommandOptions): Promise<number> {
  warnIfSelfUnpatched();
  const now = opts.now ?? new Date();
  let res: BriefResult;
  try {
    res = await makeBrief(rootsArg, { ...opts, now });
  } catch (err) {
    // Only our own config errors carry a safe message; anything else gets a fixed one.
    const name = (err as Error).name;
    process.stderr.write(`twotoe: ${name === "ModelConfigError" ? (err as Error).message : "brief failed"}\n`);
    return EXIT_ERROR;
  }
  if (opts.save) persistBrief(twotoeHome(), res.brief, res.findings);
  const text = opts.json
    ? JSON.stringify({ brief: res.brief, findings: res.findings, run: res.run }, null, 2)
    : renderBrief(res, now, process.stdout.isTTY === true);
  process.stdout.write(redactText(text) + "\n");
  return res.exitCode;
}
