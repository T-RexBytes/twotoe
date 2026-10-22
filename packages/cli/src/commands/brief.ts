import path from "node:path";
import pc from "picocolors";
import {
  installEgressGuard, Ledger, loadConfig, loadKevSnapshot, loadPack, matchAll, redactText, refreshKev, twotoeHome,
  type Brief, type Finding, type TwotoeConfig,
} from "@twotoe/core";
import {
  buildBrief, evidenceSummary, localDate, OllamaClient, resolveModel, templateDraft, writeDraft,
  type ModelClient, type WriteResult,
} from "@twotoe/writer";
import { ingestHostOf, NO_TELEMETRY, persistBrief, startTelemetry, type Telemetry } from "@twotoe/worker";
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
  telemetry?: boolean;          // --telemetry (also needs config.telemetry.dsn)
  traceContent?: "off" | "demo";
  forceRejectFirst?: boolean;   // demo trace on fixtures
  now?: Date;
  client?: ModelClient;         // tests inject a fake
  userConfig?: TwotoeConfig;    // tests inject; default ~/.twotoe/config.json
}

export interface BriefResult {
  brief: Brief;
  findings: Finding[];
  exitCode: number;
  run: Omit<WriteResult, "draft"> | null;
  checksRun: number;
  traceId?: string | null;
}

export class TelemetryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelemetryConfigError";
  }
}

// SPEC 11.4: telemetry is opt-in (config.telemetry.sentry or --telemetry) and
// needs a DSN in config.json. Content and the forced rejection are demo tools:
// fixtures only.
export function resolveTelemetry(t: TwotoeConfig["telemetry"], opts: BriefCommandOptions): { dsn: string; content: boolean } | null {
  const content = (opts.traceContent ?? t?.traceContent) === "demo";
  if (opts.forceRejectFirst && !opts.fixture) throw new TelemetryConfigError("--force-reject-first only runs on fixtures (--fixture)");
  if (content && !opts.fixture) throw new TelemetryConfigError("--trace-content demo only runs on fixtures (--fixture)");
  const enabled = opts.telemetry ?? t?.sentry === true;
  if (!enabled) return null;
  if (!t?.dsn) throw new TelemetryConfigError("telemetry is on but ~/.twotoe/config.json has no telemetry.dsn");
  return { dsn: t.dsn, content };
}

export async function makeBrief(rootsArg: string[], opts: BriefCommandOptions): Promise<BriefResult> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const tele = resolveTelemetry((opts.userConfig ?? loadConfig()).telemetry, opts);
  const ledger = new Ledger();
  // All network goes through the guard, template mode included (CLAUDE.md rule 4).
  // The Sentry ingest host is allowed only when telemetry is on.
  const uninstall = installEgressGuard({ ledger, offline: opts.offline === true, extraHosts: tele ? [ingestHostOf(tele.dsn)] : [] });
  let telemetry: Pick<Telemetry, "tracer" | "run" | "step" | "flush" | "close"> = NO_TELEMETRY;
  try {
    if (tele) telemetry = await startTelemetry({ dsn: tele.dsn, content: tele.content, environment: tele.content ? "demo" : "cli" });
    let traceId = "";
    const out = await telemetry.run(opts.fixture ? "twotoe brief (fixture)" : "twotoe brief", async (id) => {
      traceId = id;
      const { result, config } = await telemetry.step("twotoe.scan", "scan", async (s) => {
        const r = await collect(rootsArg, opts);
        s.set("twotoe.checks_run", r.result.inventory.checksRun);
        s.set("twotoe.inventory_items", r.result.inventory.items.length);
        return r;
      });
      const pack = loadPack();
      // SPEC 7.5 / 12: refresh the CISA KEV feed unless --offline. Fixture runs use
      // the bundled snapshot so demos, tests and the eval stay reproducible.
      const kev = await telemetry.step("twotoe.kev", "refresh CISA KEV", async (s) => {
        const r = opts.fixture
          ? { entries: loadKevSnapshot(), source: "bundled" as const }
          : await refreshKev({ now, snapshotPath: path.join(twotoeHome(), "kev-snapshot.json"), offline: opts.offline === true });
        s.set("twotoe.kev.source", r.source);
        s.set("twotoe.kev.entries", r.entries.length);
        return r;
      });
      const findings = await telemetry.step("twotoe.match", "match", async (s) => {
        const f = matchAll(result.inventory, pack, { region: opts.region ?? config.region ?? null, now, kev: kev.entries });
        s.set("twotoe.findings", f.length);
        return f;
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
          tracer: telemetry.tracer,
          traceContent: tele?.content === true,
          forceRejectFirst: opts.forceRejectFirst === true,
        });
        ({ draft, mode, model, attempts, rejections } = w);
        const { draft: _d, ...rest } = w;
        run = rest;
      }
      const make = () => buildBrief({
        draft, findings, inventory: result.inventory, now, durationMs: Date.now() - started,
        egress: ledger.entries(), mode, model, attempts, validatorRejections: rejections,
      });
      const brief = await telemetry.step("twotoe.assemble", "assemble and persist", async () => {
        const b = make();
        if (opts.save) save(b, findings, run, result.inventory.checksRun);
        return b;
      });
      return { brief, findings, run, checksRun: result.inventory.checksRun, make };
    });

    let brief = out.brief;
    if (tele) {
      // Send the trace, then rebuild the brief so its ledger shows what left.
      await telemetry.flush(10_000);
      brief = out.make();
      if (opts.save) save(brief, out.findings, out.run, out.checksRun);
    }
    const actionable = out.findings.some((f) => f.confidence === "definite" || f.confidence === "likely");
    return { brief, findings: out.findings, run: out.run, checksRun: out.checksRun, exitCode: actionable ? EXIT_ACTIONS : EXIT_NOTHING, traceId: tele ? traceId : null };
  } finally {
    await telemetry.close();
    uninstall();
  }
}

function save(brief: Brief, findings: Finding[], run: BriefResult["run"], checksRun: number): void {
  persistBrief(twotoeHome(), brief, findings, {
    checksRun,
    promptVersion: run?.promptVersion ?? null,
    attempts: run?.attemptLog ?? [],
  });
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
  out.push(c.dim(`  card: twotoe card   ${model}   ${validatorSummary(brief, run)}`));
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
    const safe = name === "ModelConfigError" || name === "TelemetryConfigError";
    process.stderr.write(`twotoe: ${safe ? (err as Error).message : "brief failed"}\n`);
    return EXIT_ERROR;
  }
  const text = opts.json
    ? JSON.stringify({ brief: res.brief, findings: res.findings, run: res.run, traceId: res.traceId ?? null }, null, 2)
    : renderBrief(res, now, process.stdout.isTTY === true);
  process.stdout.write(redactText(text) + "\n");
  if (res.traceId && !opts.json) process.stdout.write(`  trace: ${res.traceId} (search it in Sentry, Explore > Traces)\n`);
  return res.exitCode;
}
