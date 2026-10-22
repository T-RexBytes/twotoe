import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";
import type { ChatRequest, ChatResult, ModelClient } from "@twotoe/writer";

export const CANARY = "TWOTOE_CANARY_9f3a";

const made: string[] = [];
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

export function tempDir(prefix = "twotoe-worker-"): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(d);
  return d;
}

function write(base: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(base, ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

// f01 + f06 + f10 + f17 kitchen sink, plus a config.json pointing at it.
export function kitchenSinkConfig(): { configPath: string; stateDir: string } {
  const root = tempDir();
  const fixture = path.join(root, "fixture");
  write(fixture, {
    "probe.json": JSON.stringify({ nodeVersion: "24.22.0", plexVersion: "1.43.3.10860" }),
    "project/ai/.venv/Lib/site-packages/litellm-1.107.0.dist-info/METADATA": "Name: litellm\n",
    "project/ai/.env": `SECRET_VALUE=${CANARY}\n`,
    "project/rail/.env": `RAILWAY_TOKEN=${CANARY}\nSECRET_VALUE=${CANARY}\n`,
    "project/rail/railway.toml": "[build]\n",
  });
  const configPath = path.join(root, "config.json");
  fs.writeFileSync(configPath, JSON.stringify({ fixture: "fixture", region: "IN" }));
  const stateDir = path.join(root, "state");
  return { configPath, stateDir };
}

interface PromptFinding { id: string; confidence: string; action: string; summary: string }

function section(user: string, start: string, end: string): PromptFinding[] {
  const from = user.indexOf(start);
  if (from < 0) return [];
  const rest = user.slice(from + start.length);
  const to = rest.indexOf(end);
  return JSON.parse(to >= 0 ? rest.slice(0, to) : rest) as PromptFinding[];
}

const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(" ", n - 3))}...`);

// A stand-in model: rephrases nothing, just returns a valid draft built from
// the prompt's own findings. Counts its calls.
export class PromptEchoClient implements ModelClient {
  calls = 0;
  async chat(req: ChatRequest): Promise<ChatResult> {
    this.calls++;
    const items = section(req.user, "FINDINGS (ordered by priority, already verified):\n", "\n\nFYI (awareness only, never actions):");
    const fyi = section(req.user, "FYI (awareness only, never actions):\n", "\n\nWRITE:");
    const draft = {
      line1Actions: items.filter((f) => f.confidence === "definite" || f.confidence === "likely").slice(0, 2)
        .map((f) => cut(f.action.charAt(0).toLowerCase() + f.action.slice(1), 60)),
      line2Tail: "go back to sleep",
      checklist: items.map((f) => ({ findingId: f.id, action: f.action, why: cut(f.summary, 140) })),
      fyi: fyi.map((f) => cut(f.summary, 160)),
    };
    return { content: JSON.stringify(draft), wallMs: 1, evalCount: 1, promptEvalCount: 1 };
  }
}

export function temporalExeOrNull(): string | null {
  const p = path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links", "temporal.exe");
  return fs.existsSync(p) ? p : null;
}
