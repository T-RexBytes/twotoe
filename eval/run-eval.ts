// SPEC 14.3 eval harness.
//   pnpm tsx eval/run-eval.ts --models gemma4:e4b,gemma4:e2b,qwen3:4b --runs 5
// Options: --only f22,f06 (fixture prefixes), --no-llm (matcher + template only)
// Writes eval/RESULTS.md (paste-ready tables), eval/results.json (raw), and
// one artifact per writer run under eval/out/ (gitignored).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectInventory, FixtureProbe, installEgressGuard, Ledger, loadConfig, loadKevSnapshot, loadPack, matchAll, redactText, runFile, runPowerShell,
  type AdvisoryPack, type Finding, type Inventory,
} from "@twotoe/core";
import {
  buildBrief, localDate, OllamaClient, PROMPT_VERSION, templateDraft, validate, writeDraft,
  type ChatRequest, type ChatResult, type ModelClient,
} from "@twotoe/writer";
import { median, p90, reasonCategory } from "./lib";

const EVAL = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(EVAL, "..");
const FIXTURES = path.join(EVAL, "fixtures");
const OUT = path.join(EVAL, "out");
const CANARY = "TWOTOE_CANARY_9f3a";
const NOW = new Date(2026, 9, 23, 7, 0);   // Fri Oct 23, 07:00 local: the brief's morning

// ---------- args ----------
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
// --no-llm and --from-results never call a model.
const MODELS = process.argv.includes("--no-llm") || process.argv.includes("--from-results")
  ? [] : (arg("models") ?? "gemma4:e4b").split(",").map((m) => m.trim()).filter(Boolean);
const RUNS = Number(arg("runs") ?? 5);
const ONLY = arg("only")?.split(",").map((s) => s.trim());
const FROM_RESULTS = process.argv.includes("--from-results");

// ---------- types ----------
interface Expected {
  fixture: string;
  condition: string;
  findings: Array<{ advisoryId: string; confidence: string }>;
  ordered?: boolean;
  line1?: string;
}

interface FixtureRun {
  name: string;
  expected: Expected;
  inventory: Inventory;
  findings: Finding[];
  scanMatchMs: number;
  region: string | null;
}

interface AttemptRecord {
  attempt: number;
  wallMs: number;
  evalCount: number | null;
  evalDurationMs: number | null;
  reasons: string[];
  content: string | null;
}

interface WriterRun {
  model: string;
  fixture: string;
  run: number;
  seed: number;
  mode: string;
  attempts: AttemptRecord[];
  writerMs: number;
  totalMs: number;
  finalUngrounded: number;
  fallbackParts: string[];
  line1: string;
}

// ---------- helpers ----------
const sec = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : "n/a");
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");

class RecordingClient implements ModelClient {
  readonly records: ChatResult[] = [];
  constructor(private readonly inner: ModelClient) {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    const r = await this.inner.chat(req);
    this.records.push(r);
    return r;
  }
}

// ---------- matcher pass ----------
async function runMatcher(dirs: string[], pack: AdvisoryPack): Promise<FixtureRun[]> {
  const kev = loadKevSnapshot();
  const out: FixtureRun[] = [];
  for (const name of dirs) {
    const dir = path.join(FIXTURES, name);
    const expected = JSON.parse(fs.readFileSync(path.join(dir, "expected.json"), "utf8")) as Expected;
    const config = loadConfig(path.join(dir, "config.json"));
    const t0 = Date.now();
    const { inventory } = await collectInventory({
      roots: [path.join(dir, "project")], probe: new FixtureProbe(path.join(dir, "probe.json")), home: dir, machinePython: false, now: () => NOW,
    });
    const findings = matchAll(inventory, pack, { region: config.region ?? null, now: NOW, kev });
    out.push({ name, expected, inventory, findings, scanMatchMs: Date.now() - t0, region: config.region ?? null });
  }
  return out;
}

interface MatcherScore {
  perAdvisory: Map<string, { tp: number; fp: number; fn: number }>;
  misses: string[];
  orderOk: Map<string, boolean>;
  line1Ok: Map<string, { ok: boolean; got: string; want: string }>;
}

function scoreMatcher(runs: FixtureRun[], pack: AdvisoryPack): MatcherScore {
  const perAdvisory = new Map(pack.advisories.map((a) => [a.id, { tp: 0, fp: 0, fn: 0 }]));
  const misses: string[] = [];
  const orderOk = new Map<string, boolean>();
  const line1Ok = new Map<string, { ok: boolean; got: string; want: string }>();
  for (const r of runs) {
    const key = (x: { advisoryId: string; confidence: string }) => `${x.advisoryId}|${x.confidence}`;
    const want = r.expected.findings.map(key);
    const got = r.findings.map(key);
    const remaining = [...got];
    for (const w of want) {
      const i = remaining.indexOf(w);
      const [adv] = w.split("|");
      if (i >= 0) { perAdvisory.get(adv!)!.tp++; remaining.splice(i, 1); }
      else { perAdvisory.get(adv!)!.fn++; misses.push(`${r.name}: expected ${w.replace("|", " ")}, got ${got.length ? got.map((g) => g.replace("|", " ")).join(", ") : "nothing"}`); }
    }
    for (const g of remaining) {
      const [adv] = g.split("|");
      perAdvisory.get(adv!)!.fp++;
      misses.push(`${r.name}: unexpected ${g.replace("|", " ")}`);
    }
    if (r.expected.ordered) orderOk.set(r.name, JSON.stringify(got) === JSON.stringify(want));
    if (r.expected.line1) {
      const draft = templateDraft(r.findings, pack);
      const brief = buildBrief({ draft, findings: r.findings, inventory: r.inventory, now: NOW, durationMs: r.scanMatchMs, mode: "template" });
      line1Ok.set(r.name, { ok: brief.line1 === r.expected.line1, got: brief.line1, want: r.expected.line1 });
    }
  }
  return { perAdvisory, misses, orderOk, line1Ok };
}

// ---------- writer pass ----------
async function runWriter(model: string, fixtures: FixtureRun[], pack: AdvisoryPack, log: (s: string) => void): Promise<WriterRun[]> {
  const client = new OllamaClient();
  // Warm-up: load the model once so cold-start time does not count as latency.
  try {
    await client.chat({ model, system: "Reply with JSON.", user: "{}", schema: { type: "object" }, timeoutMs: 180_000 });
  } catch (err) {
    log(`  warm-up failed for ${model}: ${(err as Error).message}`);
  }
  const results: WriterRun[] = [];
  const kevOf = (f: Finding) => pack.advisories.find((a) => a.id === f.advisoryId)?.kev ?? false;
  for (let run = 1; run <= RUNS; run++) {
    const seed = 41 + run;
    for (const fx of fixtures) {
      if (fx.findings.length === 0) continue;   // nothing to phrase: no model call in production either
      const rec = new RecordingClient(client);
      const t0 = Date.now();
      const w = await writeDraft({ findings: fx.findings, pack, date: localDate(NOW), roots: fx.inventory.roots, client: rec, model, seed });
      const writerMs = Date.now() - t0;
      const attempts: AttemptRecord[] = w.attemptLog.map((a, i) => ({
        attempt: a.attempt,
        wallMs: a.wallMs,
        evalCount: rec.records[i]?.evalCount ?? null,
        evalDurationMs: rec.records[i]?.evalDurationMs ?? null,
        reasons: a.reasons,
        content: rec.records[i]?.content ?? null,
      }));
      const finalUngrounded = validate(w.draft, fx.findings, kevOf).filter((r) => r.startsWith("ungrounded token")).length;
      const brief = buildBrief({ draft: w.draft, findings: fx.findings, inventory: fx.inventory, now: NOW, durationMs: fx.scanMatchMs + writerMs, mode: w.mode, model: w.model, attempts: w.attempts, validatorRejections: w.rejections });
      const r: WriterRun = {
        model, fixture: fx.name, run, seed, mode: w.mode, attempts, writerMs, totalMs: fx.scanMatchMs + writerMs,
        finalUngrounded, fallbackParts: w.fallbackParts, line1: brief.line1,
      };
      results.push(r);
      const dir = path.join(OUT, model.replace(/[^A-Za-z0-9._-]/g, "_"), fx.name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `run${run}.json`), redactText(JSON.stringify({ ...r, brief }, null, 2)));
      log(`  ${model} run ${run} ${fx.name}: ${w.mode}, ${w.attempts} attempt(s), ${w.rejections.length} rejection(s), ${sec(writerMs)}`);
    }
  }
  return results;
}

// ---------- report ----------
// Bolds the first whole-token occurrence ("21" must not light up inside "2026").
function highlight(text: string, token: string): string {
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?<![\\w.])${esc}(?![\\w.]*\\d)`).exec(text);
  return m ? `${text.slice(0, m.index)}**${token}**${text.slice(m.index + token.length)}` : text;
}

function outcome(r: WriterRun, a: AttemptRecord): string {
  if (r.attempts.length <= a.attempt) return r.mode === "llm" ? "accepted" : "template used for the failing parts";
  return r.mode === "llm" ? "accepted on retry" : "retry rejected too; template used for the failing parts";
}

function sampleRejections(runs: WriterRun[], n: number): string[] {
  const out: string[] = [];
  const seenModels = new Set<string>();
  const candidates = runs.flatMap((r) => r.attempts.filter((a) => a.reasons.length && a.content).map((a) => ({ r, a })));
  // Prefer one ungrounded-token sample per model, then anything else.
  candidates.sort((x, y) => Number(!x.a.reasons.some((s) => s.startsWith("ungrounded"))) - Number(!y.a.reasons.some((s) => s.startsWith("ungrounded"))));
  for (const { r, a } of candidates) {
    if (out.length >= n) break;
    if (seenModels.has(r.model) && candidates.some((c) => !seenModels.has(c.r.model))) continue;
    seenModels.add(r.model);
    const reason = a.reasons.find((s) => s.startsWith("ungrounded token")) ?? a.reasons[0]!;
    let excerpt = "";
    const m = reason.match(/^ungrounded token "(.+?)" in (.+)$/);
    try {
      const draft = JSON.parse(a.content!) as { checklist?: Array<{ findingId: string; action: string; why: string }>; line1Actions?: string[]; fyi?: string[]; line2Tail?: string };
      if (m) {
        const where = m[2]!;
        const field = where === "line1Actions" ? (draft.line1Actions ?? []).join(" | ")
          : where === "fyi" ? (draft.fyi ?? []).join(" | ")
            : (() => { const it = draft.checklist?.find((c) => c.findingId === where); return it ? `${it.action} / ${it.why}` : ""; })();
        excerpt = highlight(field, m[1]!);
      } else if (/line2Tail/.test(reason)) {
        excerpt = draft.line2Tail ?? "";
      } else if (/why over|action over/.test(reason)) {
        const id = reason.split(" in ").pop();
        const it = draft.checklist?.find((c) => c.findingId === id);
        excerpt = it ? (reason.startsWith("why") ? it.why : it.action) : "";
      } else {
        excerpt = a.content!.slice(0, 200);
      }
    } catch {
      excerpt = a.content!.slice(0, 200);
    }
    out.push(`- **${r.model}**, ${r.fixture}, run ${r.run}, attempt ${a.attempt}. Rejected for: \`${reason}\`${a.reasons.length > 1 ? ` (+${a.reasons.length - 1} more)` : ""}.\n  > ${excerpt.replace(/\n/g, " ")}\n  Outcome: ${outcome(r, a)} (final mode \`${r.mode}\`).`);
  }
  return out;
}

async function hardware(): Promise<string> {
  const cpu = os.cpus()[0]?.model.trim() ?? "unknown CPU";
  const ram = `${(os.totalmem() / 1024 ** 3).toFixed(1)} GB RAM`;
  const gpu = await runPowerShell("(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }) -join '; '", {});
  return `${cpu}, ${ram}, GPU: ${gpu.ok ? gpu.stdout.trim() : "unknown"}, ${os.type()} ${os.release()}`;
}

async function gitCommit(): Promise<string> {
  const r = await runFile("git", ["-C", REPO, "rev-parse", "--short", "HEAD"], { inheritEnv: true });
  return r.ok ? r.stdout.trim() : "unknown";
}

function grepCanary(paths: string[]): number {
  let hits = 0;
  const walk = (p: string) => {
    if (!fs.existsSync(p)) return;
    const st = fs.statSync(p);
    if (st.isDirectory()) { for (const c of fs.readdirSync(p)) walk(path.join(p, c)); return; }
    if (fs.readFileSync(p, "utf8").includes(CANARY)) hits++;
  };
  for (const p of paths) walk(p);
  return hits;
}

function writerTable(models: string[], all: WriterRun[]): string {
  const rows = models.map((m) => {
    const runs = all.filter((r) => r.model === m);
    const drafts = runs.flatMap((r) => r.attempts);
    const ungroundedDrafts = drafts.filter((a) => a.reasons.some((x) => x.startsWith("ungrounded token"))).length;
    const rejectedDrafts = drafts.filter((a) => a.reasons.length).length;
    const retries = runs.filter((r) => r.attempts.length > 1).length;
    const fallbacks = runs.filter((r) => r.mode === "llm-fallback").length;
    const finalUngrounded = runs.reduce((s, r) => s + r.finalUngrounded, 0);
    const lat = runs.map((r) => r.writerMs);
    const tok = drafts.reduce((s, a) => s + (a.evalCount ?? 0), 0);
    const tokMs = drafts.reduce((s, a) => s + (a.evalDurationMs ?? 0), 0);
    return `| ${m} | ${runs.length} | ${drafts.length} | ${rejectedDrafts} (${pct(rejectedDrafts, drafts.length)}) | ${ungroundedDrafts} (${pct(ungroundedDrafts, drafts.length)}) | ${retries} | ${fallbacks} | **${finalUngrounded}** | ${sec(median(lat))} | ${sec(p90(lat))} | ${tokMs ? (tok / (tokMs / 1000)).toFixed(1) : "n/a"} |`;
  });
  return [
    "| Model | Briefs | Drafts | Drafts rejected | Drafts with an ungrounded token (before validator) | Briefs retried | Briefs with template fallback | Ungrounded tokens after validator | Median writer latency | p90 | Tokens/s |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

function histogramTable(models: string[], all: WriterRun[]): string {
  const cats = new Set<string>();
  const counts = new Map<string, Map<string, number>>();
  for (const m of models) counts.set(m, new Map());
  for (const r of all) for (const a of r.attempts) for (const reason of a.reasons) {
    const c = reasonCategory(reason);
    cats.add(c);
    const mm = counts.get(r.model)!;
    mm.set(c, (mm.get(c) ?? 0) + 1);
  }
  if (!cats.size) return "No rejections.";
  const sorted = [...cats].sort((a, b) => models.reduce((s, m) => s + (counts.get(m)!.get(b) ?? 0), 0) - models.reduce((s, m) => s + (counts.get(m)!.get(a) ?? 0), 0));
  return [
    `| Reason | ${models.join(" | ")} |`,
    `|---|${models.map(() => "---").join("|")}|`,
    ...sorted.map((c) => `| ${c} | ${models.map((m) => counts.get(m)!.get(c) ?? 0).join(" | ")} |`),
  ].join("\n");
}

function endToEndTable(models: string[], fixtures: FixtureRun[], all: WriterRun[]): string {
  const header = `| Fixture | Findings | Scan + match | ${models.map((m) => `${m} (median total)`).join(" | ")} |`;
  const rows = fixtures.map((f) => {
    const cells = models.map((m) => {
      const t = all.filter((r) => r.model === m && r.fixture === f.name).map((r) => r.totalMs);
      return t.length ? sec(median(t)) : "no model call";
    });
    return `| ${f.name} | ${f.findings.length} | ${(f.scanMatchMs / 1000).toFixed(2)} s | ${cells.join(" | ")} |`;
  });
  return [header, `|---|---|---|${models.map(() => "---").join("|")}|`, ...rows].join("\n");
}

async function main() {
  const log = (s: string) => process.stdout.write(`${s}\n`);
  const ledger = new Ledger();
  const uninstall = installEgressGuard({ ledger, offline: true });
  const started = Date.now();
  try {
    const pack = loadPack();
    let dirs = fs.readdirSync(FIXTURES).filter((d) => /^f\d{2}-/.test(d)).sort();
    if (ONLY) dirs = dirs.filter((d) => ONLY.some((o) => d.startsWith(o)));
    log(`fixtures: ${dirs.length}, models: ${MODELS.join(", ") || "none (template only)"}, runs: ${RUNS}`);

    const fixtures = await runMatcher(dirs, pack);
    const score = scoreMatcher(fixtures, pack);
    const kevOf = (f: Finding) => pack.advisories.find((a) => a.id === f.advisoryId)?.kev ?? false;
    const templateRejections = fixtures.reduce((s, f) => s + validate(templateDraft(f.findings, pack), f.findings, kevOf).length, 0);
    log(`matcher: ${score.misses.length} miss(es); template drafts rejected by the validator: ${templateRejections}`);

    // --from-results: re-render the report from eval/results.json (no model calls,
    // same measurements). Used when only the report code changed.
    const writerRuns: WriterRun[] = [];
    let wallMs: number | null = null;
    let savedCommit: string | null = null;
    if (FROM_RESULTS) {
      const saved = JSON.parse(fs.readFileSync(path.join(EVAL, "results.json"), "utf8")) as {
        writerRuns: WriterRun[];
        meta?: { wallMs?: number; commit?: string };
        fixtures?: Array<{ name: string; scanMatchMs?: number }>;
      };
      writerRuns.push(...saved.writerRuns);
      // Keep the original run's commit, wall time and scan timings: older results.json
      // files lack them, so fall back to the RESULTS.md that run produced.
      const prev = fs.existsSync(path.join(EVAL, "RESULTS.md")) ? fs.readFileSync(path.join(EVAL, "RESULTS.md"), "utf8") : "";
      const wallM = prev.match(/Wall time for this eval: ([\d.]+) s/);
      wallMs = saved.meta?.wallMs ?? (wallM ? Number(wallM[1]) * 1000 : null);
      savedCommit = saved.meta?.commit ?? prev.match(/at commit `([0-9a-f]+)`/)?.[1] ?? null;
      for (const f of fixtures) {
        const stored = saved.fixtures?.find((x) => x.name === f.name)?.scanMatchMs;
        const row = prev.match(new RegExp(`^\\| ${f.name} \\| \\d+ \\| ([\\d.]+) s \\|`, "m"));
        if (stored !== undefined) f.scanMatchMs = stored;
        else if (row) f.scanMatchMs = Number(row[1]) * 1000;
      }
      log(`re-rendering from results.json: ${writerRuns.length} writer runs, commit ${savedCommit ?? "unknown"}`);
    } else {
      fs.rmSync(OUT, { recursive: true, force: true });
    }
    const meta = { hardware: await hardware(), commit: savedCommit ?? await gitCommit(), ollama: "unknown" };
    try {
      const v = await (await fetch("http://127.0.0.1:11434/api/version")).json() as { version?: string };
      meta.ollama = v.version ?? "unknown";
    } catch { /* Ollama not running: template-only report */ }

    const report = () => {
      const tp = [...score.perAdvisory.values()].reduce((s, x) => s + x.tp, 0);
      const fp = [...score.perAdvisory.values()].reduce((s, x) => s + x.fp, 0);
      const fn = [...score.perAdvisory.values()].reduce((s, x) => s + x.fn, 0);
      const canaryHits = grepCanary([OUT, path.join(EVAL, "results.json")]);
      const models = [...new Set(writerRuns.map((r) => r.model))];
      const lines = [
        "# TwoToe eval results",
        "",
        `Generated by \`eval/run-eval.ts\` on ${new Date().toISOString().slice(0, 10)} at commit \`${meta.commit}\`. Do not edit by hand.`,
        "",
        `- Fixtures: ${fixtures.length} synthetic (SPEC 14.2), ground truth in \`eval/fixtures/*/expected.json\`.`,
        `- Models: ${models.join(", ") || "none"}; ${RUNS} runs each; run *r* uses seed 41 + *r* (run 1 is the production seed 42), temperature 0.2, thinking off.`,
        `- Prompt version ${PROMPT_VERSION}; advisory pack ${pack.packVersion}; Ollama ${meta.ollama}.`,
        `- Hardware: ${meta.hardware}.`,
        `- Wall time for this eval: ${sec(wallMs ?? Date.now() - started)}.${FROM_RESULTS ? " (Report re-rendered from eval/results.json; measurements unchanged.)" : ""}`,
        "",
        "## 1. Matcher",
        "",
        "A finding counts as a true positive only if both the advisory and the confidence tier match the ground truth.",
        "",
        "| Advisory | TP | FP | FN |",
        "|---|---|---|---|",
        ...pack.advisories.map((a) => { const s = score.perAdvisory.get(a.id)!; return `| ${a.id} | ${s.tp} | ${s.fp} | ${s.fn} |`; }),
        `| **All** | **${tp}** | **${fp}** | **${fn}** |`,
        "",
        `Precision ${pct(tp, tp + fp)}, recall ${pct(tp, tp + fn)}.`,
        ...[...score.orderOk].map(([n, ok]) => `Priority order for ${n}: ${ok ? "correct" : "**wrong**"}.`),
        ...[...score.line1Ok].map(([n, v]) => `Line 1 for ${n}: ${v.ok ? `"${v.got}" (correct)` : `**"${v.got}"**, expected "${v.want}"`}.`),
        "",
        score.misses.length ? `Misses:\n\n${score.misses.map((m) => `- ${m}`).join("\n")}` : "Misses: none.",
        "",
        "## 2. Writer per model",
        "",
        `Template baseline (no model): ${fixtures.length} briefs, ${templateRejections} validator rejections, about 0 s of writer time.`,
        "",
        models.length ? writerTable(models, writerRuns) : "No model runs.",
        "",
        "A *draft* is one model response; a brief takes one draft, or two when the validator rejects the first. \"Ungrounded tokens after validator\" counts tokens in the final brief that code did not establish; it must be 0.",
        "",
        "### Rejection reasons (all drafts)",
        "",
        models.length ? histogramTable(models, writerRuns) : "No model runs.",
        "",
        "## 3. End to end",
        "",
        "Median total time per fixture (scan + match + writer). Fixtures with no findings make no model call.",
        "",
        endToEndTable(models, fixtures, writerRuns),
        "",
        "## 4. Canary",
        "",
        `Canary hits in eval artifacts (\`eval/out\`, \`eval/results.json\`): **${canaryHits}** (must be 0). Egress during the eval: ${[...new Set(ledger.entries().map((e) => e.host))].join(", ") || "none"}.`,
        "",
        "## 5. Sample rejected drafts",
        "",
        ...(models.length ? sampleRejections(writerRuns, 3) : ["No model runs."]),
        "",
      ];
      fs.writeFileSync(path.join(EVAL, "results.json"), redactText(JSON.stringify({
        meta: { wallMs: wallMs ?? Date.now() - started, commit: meta.commit, runs: RUNS, promptVersion: PROMPT_VERSION, packVersion: pack.packVersion },
        fixtures: fixtures.map((f) => ({ name: f.name, scanMatchMs: f.scanMatchMs, findings: f.findings.map((x) => ({ advisoryId: x.advisoryId, confidence: x.confidence, priority: x.priority })) })),
        writerRuns,
      }, null, 2)));
      fs.writeFileSync(path.join(EVAL, "RESULTS.md"), redactText(lines.join("\n")));
      return canaryHits;
    };

    report();
    for (const model of MODELS) {
      log(`writer: ${model}`);
      writerRuns.push(...await runWriter(model, fixtures, pack, log));
      const hits = report();   // keep partial results if a later model fails
      log(`  saved RESULTS.md after ${model} (canary hits ${hits})`);
    }
    const hits = report();
    log(`done in ${sec(Date.now() - started)}; canary hits ${hits}`);
    if (hits > 0) process.exitCode = 1;
  } finally {
    uninstall();
  }
}

main().catch((err: Error) => {
  process.stderr.write(`eval failed: ${err.message}\n`);
  process.exitCode = 2;
});
