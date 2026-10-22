// Generates the card's bundled example briefs from synthetic fixtures (SPEC 14.2):
//   f22 kitchen-sink = f01 + f06 + f10 + f17, f06 railway-user, f23 clean-machine.
// Each fixture lives in a throwaway fake home, so evidence paths read
// "~\code\..." and never contain a real path from this machine. The writer is
// the real local model (through the egress guard) when Ollama answers;
// otherwise the template. Run: pnpm --filter @twotoe/card examples
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectInventory, FixtureProbe, installEgressGuard, Ledger, loadPack, matchAll, redactText } from "@twotoe/core";
import { buildBrief, buildCardData, localDate, OllamaClient, resolveModel, templateDraft, writeDraft } from "@twotoe/writer";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "example");
const CANARY = "TWOTOE_CANARY_9f3a";
const SECRET = `SECRET_VALUE=${CANARY}\n`;
const NOW = new Date(2026, 9, 23, 7, 0);   // Fri Oct 23, 07:00 local

interface Fixture {
  slug: string;
  name: string;
  label: string;
  probe: Record<string, unknown>;
  files: Record<string, string>;
}

const FIXTURES: Fixture[] = [
  {
    slug: "f22", name: "kitchen-sink", label: "Kitchen sink (fixture f22)",
    probe: { nodeVersion: "24.22.0", plexVersion: "1.43.3.10860" },
    files: {
      "ai-notes/.venv/Lib/site-packages/litellm-1.107.0.dist-info/METADATA": "Name: litellm\nVersion: 1.107.0\n",
      "ai-notes/requirements.txt": "litellm==1.107.0\nhttpx==0.28.1\n",
      "ai-notes/.env": `OPENAI_API_KEY=sk-fixture\n${SECRET}`,
      "side-hustle-api/railway.toml": "[build]\nbuilder = \"nixpacks\"\n",
      "side-hustle-api/.env": `RAILWAY_TOKEN=fixture\nDATABASE_URL=postgres://fixture\n${SECRET}`,
    },
  },
  {
    slug: "f06", name: "railway-user", label: "Railway user (fixture f06)",
    probe: { nodeVersion: "24.22.1" },
    files: {
      "side-hustle-api/railway.toml": "[build]\nbuilder = \"nixpacks\"\n",
      "side-hustle-api/.env": `RAILWAY_TOKEN=fixture\n${SECRET}`,
    },
  },
  {
    slug: "f23", name: "clean-machine", label: "Clean night (fixture f23)",
    probe: { nodeVersion: "24.22.1", phpVersion: "8.3.36", plexVersion: "1.43.3.10861" },
    files: {
      "blog/requirements.txt": "litellm==1.106.2\n",
      "blog/.env.sample": "RAILWAY_TOKEN=\n",
      "blog/.env": SECRET,
      "blog/Dockerfile": "FROM node:24.22.1-alpine\n",
    },
  },
];

async function generate(f: Fixture, client: OllamaClient | null): Promise<string> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "twotoe-example-"));
  try {
    const code = path.join(home, "code");
    for (const [rel, content] of Object.entries(f.files)) {
      const full = path.join(code, ...rel.split("/"));
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    const started = Date.now();
    const ledger = new Ledger();
    const uninstall = installEgressGuard({ ledger, offline: true });
    try {
      const { inventory } = await collectInventory({ roots: [code], probe: new FixtureProbe(f.probe), home, machinePython: false, now: () => NOW });
      const pack = loadPack();
      const findings = matchAll(inventory, pack, { now: NOW });
      const w = client
        ? await writeDraft({ findings, pack, date: localDate(NOW), roots: inventory.roots, client, model: resolveModel() })
        : { draft: templateDraft(findings, pack), mode: "template" as const, model: null, attempts: 0, rejections: [], attemptLog: [], promptVersion: null };
      const brief = buildBrief({
        draft: w.draft, findings, inventory, now: NOW, durationMs: Date.now() - started,
        egress: ledger.entries(), mode: w.mode, model: w.model, attempts: w.attempts, validatorRejections: w.rejections,
      });
      const card = buildCardData({
        source: "example", label: f.label, brief, findings, pack,
        attempts: w.attemptLog, promptVersion: w.promptVersion, checksRun: inventory.checksRun,
      });
      const json = redactText(JSON.stringify(card, null, 2), home);
      if (json.includes(CANARY)) throw new Error(`${f.slug}: canary in output`);
      if (/AppData|twotoe-example-|[A-Za-z]:\\\\Users/i.test(json)) throw new Error(`${f.slug}: real path in output`);
      const file = path.join(OUT, `${f.slug}-${f.name}.json`);
      fs.writeFileSync(file, `${json}\n`);
      return `${f.slug}: ${brief.meta.mode}, ${brief.checklist.length} item(s), ${brief.meta.validatorRejections.length} rejection(s), ${(brief.meta.durationMs / 1000).toFixed(1)}s`;
    } finally {
      uninstall();
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const client = process.argv.includes("--no-llm") ? null : new OllamaClient();
  for (const f of FIXTURES) process.stdout.write(`${await generate(f, client)}\n`);
}

main().catch((err: Error) => {
  process.stderr.write(`gen-examples failed: ${err.message}\n`);
  process.exitCode = 1;
});
