// How much of each model's final brief is word for word the template's?
// Source of the "79 of 95 actions" numbers in docs/post/build-log.md (Gate 6d).
// Reads eval/out (gitignored; a fresh model eval run) or, if missing, the committed eval/out-v4 snapshot.
import fs from "node:fs";
import path from "node:path";
import { collectInventory, FixtureProbe, loadConfig, loadKevSnapshot, loadPack, matchAll, type Brief } from "../../packages/core/src/index";
import { buildBrief, fitSummary, templateDraft } from "../../packages/writer/src/index";
import { NOW, REPO } from "./lib";

const pack = loadPack();
const out = [path.join(REPO, "eval", "out"), path.join(REPO, "eval", "out-v4")].find((d) => fs.existsSync(d));
if (!out) throw new Error("no eval output: run pnpm tsx eval/run-eval.ts --models gemma4:e4b,gemma4:e2b,qwen3:4b --runs 5");
process.stdout.write(`reading ${path.relative(REPO, out)}\n`);

const templates = new Map<string, Brief>();
async function template(fx: string): Promise<Brief> {
  const hit = templates.get(fx);
  if (hit) return hit;
  const dir = path.join(REPO, "eval", "fixtures", fx);
  const config = loadConfig(path.join(dir, "config.json"));
  const { inventory } = await collectInventory({ roots: [path.join(dir, "project")], probe: new FixtureProbe(path.join(dir, "probe.json")), home: dir, machinePython: false, now: () => NOW });
  const findings = matchAll(inventory, pack, { region: config.region ?? null, now: NOW, kev: loadKevSnapshot() });
  const t = buildBrief({ draft: templateDraft(findings, pack), findings, inventory, now: NOW, durationMs: 0, mode: "template" });
  templates.set(fx, t);
  return t;
}

const tail = (line2: string) => line2.replace(/^Everything else: /, "").replace(/ Checked .*$/, "");
for (const model of fs.readdirSync(out)) {
  let items = 0, sameAction = 0, whyCopiedShown = 0, line1Same = 0, briefs = 0;
  const tails = new Map<string, number>();
  for (const fx of fs.readdirSync(path.join(out, model))) {
    const t = await template(fx);
    for (const f of fs.readdirSync(path.join(out, model, fx))) {
      const b = (JSON.parse(fs.readFileSync(path.join(out, model, fx, f), "utf8")) as { brief: Brief }).brief;
      briefs++;
      for (const it of b.checklist) {
        items++;
        if (t.checklist.find((x) => x.findingId === it.findingId)?.action === it.action) sameAction++;
        const adv = pack.advisories.find((a) => a.id === it.findingId.split(":")[0]);
        if (adv && it.why === fitSummary(adv.summary, 140)) whyCopiedShown++;
      }
      if (b.line1 === t.line1) line1Same++;
      tails.set(tail(b.line2), (tails.get(tail(b.line2)) ?? 0) + 1);
    }
  }
  console.log(JSON.stringify({ model, briefs, items, sameAction, whyCopiedShown, line1Same, topTails: [...tails].sort((a, b) => b[1] - a[1]).slice(0, 4) }));
}
