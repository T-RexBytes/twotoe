// Real runs, rendered as terminal screenshots for the DEV post. Fixtures only,
// except `doctor`, which reports this machine's setup (no paths, no findings).
// Usage: pnpm tsx scripts/blog/terminal-shots.ts [doctor] [brief] [explain] [ask] [crash]
// (no args: all except crash). doctor runs first because it pre-warms the model.
// Needs Ollama with gemma4:e4b for brief and ask; crash needs crash-clip.ts first.
import fs from "node:fs";
import path from "node:path";
import { makeBrief, renderBrief } from "../../packages/cli/src/commands/brief";
import { realDoctorDeps, renderChecks, runChecks } from "../../packages/cli/src/commands/doctor";
import { findFinding, renderExplain } from "../../packages/cli/src/commands/explain";
import { renderAnswer } from "../../packages/cli/src/commands/ask";
import { installEgressGuard, Ledger, loadPack, redactText } from "../../packages/core/src/index";
import { askQuestion, OllamaClient } from "../../packages/writer/src/index";
import { Browser } from "./cdp";
import { CANARY, F22, FX, IMAGES, NOW, WORK } from "./lib";
import { shootTerminal, terminalHtml } from "./terminal";

// picocolors decides at import time; FORCE_COLOR must be set before running
// (NO_COLOR wins over it, so clear that in the shell first).
const args = process.argv.slice(2);
const want = (name: string) => (args.length === 0 ? name !== "crash" : args.includes(name));

function safe(text: string): string {
  const t = redactText(text);
  if (t.includes(CANARY) || /[A-Za-z]:\\Users\\|\/Users\/|\/home\//.test(t)) throw new Error("refusing to render: canary or home path in output");
  return t;
}

const b = new Browser();
await b.start(path.join(WORK, "profile-terminal"));
const shots: Array<[string, Array<{ command: string; output: string }>]> = [];
const ledger = new Ledger();
const uninstall = installEgressGuard({ ledger, offline: true });
try {
  if (want("doctor")) {
    const checks = await runChecks(realDoctorDeps(), {});
    shots.push(["terminal-doctor.png", [{ command: "pnpm twotoe doctor", output: safe(renderChecks(checks, false, true)) }]]);
  }
  if (want("brief")) {
    const res = await makeBrief([], { fixture: F22, now: NOW, offline: true, userConfig: {} });
    const out = safe(renderBrief(res, NOW, true));
    shots.push(["terminal-brief.png", [{ command: `pnpm twotoe brief --fixture ${FX}`, output: out }]]);
    fs.writeFileSync(path.join(WORK, "brief-output.json"), JSON.stringify({ output: out, seconds: res.brief.meta.durationMs / 1000 }));
    const tpl = await makeBrief([], { fixture: F22, now: NOW, offline: true, llm: false, userConfig: {} });
    shots.push(["terminal-brief-no-llm.png", [{ command: `pnpm twotoe brief --fixture ${FX} --no-llm`, output: safe(renderBrief(tpl, NOW, true)) }]]);
  }
  if (want("explain") || want("ask")) {
    const res = await makeBrief([], { fixture: F22, now: NOW, offline: true, llm: false, userConfig: {} });
    if (want("explain")) {
      const hit = findFinding(res.findings, "plex");
      if (hit.kind !== "found") throw new Error("no plex finding in f22");
      const adv = loadPack().advisories.find((a) => a.id === hit.finding.advisoryId);
      shots.push(["terminal-explain.png", [{ command: `pnpm twotoe explain plex --fixture ${FX}`, output: safe(renderExplain(hit.finding, adv, res.brief, true)) }]]);
    }
    if (want("ask")) {
      const q = "why does the Node one matter?";
      const r = await askQuestion({ question: q, findings: res.findings, pack: loadPack(), client: new OllamaClient(), model: "gemma4:e4b" });
      shots.push(["terminal-ask.png", [{ command: `pnpm twotoe ask "${q}" --fixture ${FX}`, output: safe(renderAnswer(r, true)) }]]);
    }
  }
  if (want("crash")) {
    const text = fs.readFileSync(path.join(WORK, "crash-test.txt"), "utf8");
    shots.push(["terminal-crash-test.png", [{ command: "pnpm tsx packages/worker/scripts/crash-test.ts", output: safe(text) }]]);
  }
} finally {
  uninstall();
}
for (const [name, blocks] of shots) {
  await shootTerminal(b, terminalHtml(blocks), path.join(IMAGES, name));
  process.stdout.write(`shot ${name}\n`);
}
process.stdout.write(`egress during capture: ${JSON.stringify(ledger.entries())}\n`);
await b.close();
