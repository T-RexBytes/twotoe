// SPEC 14.4 human readability check: two people rank template vs model briefs
// blind for 6 fixtures. This builds the sheet and scores the answers.
//
//   pnpm tsx eval/blind-kit.ts                 build eval/blind/sheet.md (+ the hidden key)
//   pnpm tsx eval/blind-kit.ts --score <file>  score answers, write eval/blind/RESULTS.md
//
// Model briefs come from the latest eval run (eval/out, gemma4:e4b, first run
// that ended in mode llm). Template briefs are built here from the same
// fixture. Timings are removed from line 2 so speed does not give the writer away.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectInventory, FixtureProbe, loadConfig, loadKevSnapshot, loadPack, matchAll, type Brief } from "@twotoe/core";
import { buildBrief, templateDraft } from "@twotoe/writer";

const EVAL = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(EVAL, "fixtures");
// eval/out is rewritten by every eval run; eval/out-v4 is the committed snapshot the post uses.
const OUT = [path.join(EVAL, "out", "gemma4_e4b"), path.join(EVAL, "out-v4", "gemma4_e4b")].find((d) => fs.existsSync(d)) ?? path.join(EVAL, "out", "gemma4_e4b");
const BLIND = path.join(EVAL, "blind");
const KEY = path.join(BLIND, ".key.json");
const NOW = new Date(2026, 9, 23, 7, 0);
const PICK = ["f01-litellm-bad-venv", "f03-litellm-pin-only", "f06-railway-user", "f10-node-old-24", "f17-plex-old", "f22-kitchen-sink"];

type Writer = "model" | "template";
interface KeyEntry { fixture: string; A: Writer; B: Writer; modelRun: number }

// Small seeded PRNG so the A/B order is fixed and reproducible from the key.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function blindText(b: Pick<Brief, "line1" | "line2" | "checklist" | "fyi">): string {
  const lines = [b.line1, b.line2.replace(/ in \d+(\.\d+)?s,/, ","), ""];
  b.checklist.forEach((i, n) => lines.push(`${n + 1}. ${i.action}`, `   ${i.why}`));
  for (const f of b.fyi) lines.push(`FYI: ${f}`);
  return lines.join("\n");
}

async function templateBrief(name: string): Promise<Brief> {
  const dir = path.join(FIXTURES, name);
  const pack = loadPack();
  const config = loadConfig(path.join(dir, "config.json"));
  const { inventory } = await collectInventory({
    roots: [path.join(dir, "project")], probe: new FixtureProbe(path.join(dir, "probe.json")), home: dir, machinePython: false, now: () => NOW,
  });
  const findings = matchAll(inventory, pack, { region: config.region ?? null, now: NOW, kev: loadKevSnapshot() });
  return buildBrief({ draft: templateDraft(findings, pack), findings, inventory, now: NOW, durationMs: 0, mode: "template" });
}

function modelBrief(name: string): { brief: Brief; run: number } {
  for (let run = 1; run <= 5; run++) {
    const file = path.join(OUT, name, `run${run}.json`);
    if (!fs.existsSync(file)) continue;
    const r = JSON.parse(fs.readFileSync(file, "utf8")) as { mode: string; brief: Brief };
    if (r.mode === "llm") return { brief: r.brief, run };
  }
  throw new Error(`no llm-mode brief for ${name} in eval/out; run the eval first`);
}

async function build(): Promise<void> {
  const rand = rng(20261023);
  const key: KeyEntry[] = [];
  const sheet: string[] = [
    "# Which brief reads better?",
    "",
    "TwoToe writes a short morning security note for a developer. Below are 6 pairs. In each pair, A and B describe the same findings.",
    "",
    "For each pair, pick the one you would rather read at 7 a.m. half awake: clearer, calmer, easier to act on. \"Same\" is a fine answer. You do not need to know anything about security.",
    "",
    "Write your answers at the bottom and send them back. Please do not compare notes with the other reader.",
    "",
  ];
  for (const [i, name] of PICK.entries()) {
    const model = modelBrief(name);
    const template = await templateBrief(name);
    const modelFirst = rand() < 0.5;
    key.push({ fixture: name, A: modelFirst ? "model" : "template", B: modelFirst ? "template" : "model", modelRun: model.run });
    const [a, b] = modelFirst ? [model.brief, template] : [template, model.brief];
    sheet.push(`## Pair ${i + 1}`, "", "**A**", "", "```", blindText(a), "```", "", "**B**", "", "```", blindText(b), "```", "");
  }
  sheet.push("## Your answers", "", "Name or initials:", "", ...PICK.map((_, i) => `Pair ${i + 1}: A / B / same`), "", "Anything that bothered you (optional):", "");
  fs.mkdirSync(BLIND, { recursive: true });
  fs.writeFileSync(path.join(BLIND, "sheet.md"), sheet.join("\n"));
  fs.writeFileSync(KEY, JSON.stringify(key, null, 2));
  process.stdout.write(`wrote ${path.relative(EVAL, path.join(BLIND, "sheet.md"))} and the hidden key (${path.relative(EVAL, KEY)}). Do not open the key until both readers answered.\n`);
}

// answers file: { "<rater>": ["A", "B", "same", ...] } in pair order
export function score(key: KeyEntry[], answers: Record<string, string[]>): { model: number; template: number; same: number; rows: string[] } {
  let model = 0, template = 0, same = 0;
  const rows: string[] = [];
  for (const [rater, picks] of Object.entries(answers)) {
    picks.forEach((p, i) => {
      const k = key[i];
      if (!k) return;
      const v = p.trim().toUpperCase();
      const winner = v === "A" ? k.A : v === "B" ? k.B : "same";
      if (winner === "model") model++; else if (winner === "template") template++; else same++;
      rows.push(`| ${rater} | ${k.fixture} | ${winner} |`);
    });
  }
  return { model, template, same, rows };
}

function scoreFile(file: string): void {
  const key = JSON.parse(fs.readFileSync(KEY, "utf8")) as KeyEntry[];
  const answers = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string[]>;
  const s = score(key, answers);
  const total = s.model + s.template + s.same;
  const md = [
    "# Blind readability check (SPEC 14.4)",
    "",
    `${Object.keys(answers).length} readers, ${PICK.length} fixtures, ${total} picks. Model briefs: gemma4:e4b from the eval run in eval/out. Timings were removed from line 2.`,
    "",
    `- Model preferred: ${s.model}`,
    `- Template preferred: ${s.template}`,
    `- Same: ${s.same}`,
    "",
    "| Reader | Fixture | Preferred |",
    "|---|---|---|",
    ...s.rows,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(BLIND, "RESULTS.md"), md);
  process.stdout.write(md);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--score");
  if (i >= 0 && process.argv[i + 1]) scoreFile(process.argv[i + 1]!);
  else await build();
}
