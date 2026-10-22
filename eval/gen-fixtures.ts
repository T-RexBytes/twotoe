// SPEC 14.2: the 24 eval fixtures. Each has probe.json (machine facts for
// FixtureProbe), project/ (synthetic files), expected.json (ground truth:
// advisoryId + confidence, written from the spec table, never from matcher
// output), and a .env carrying the canary. Run: pnpm tsx eval/gen-fixtures.ts
//
// Ground truth is protected: if an expected.json already exists with
// different content, this script stops (CLAUDE.md rule 7). Pass --force only
// when the spec table itself changed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
export const CANARY = "TWOTOE_CANARY_9f3a";
const CANARY_ENV = `SECRET_VALUE=${CANARY}\n`;
const force = process.argv.includes("--force");

type Confidence = "definite" | "likely" | "possible" | "fyi";

interface Expected {
  fixture: string;
  condition: string;
  findings: Array<{ advisoryId: string; confidence: Confidence }>;
  ordered?: boolean;          // f22: findings must come out in this order
  line1?: string;             // f23: exact template line 1
}

interface FixtureDef {
  name: string;
  condition: string;
  probe?: Record<string, unknown>;
  config?: Record<string, unknown>;
  files?: Record<string, string>;
  expected: Expected["findings"];
  ordered?: boolean;
  line1?: string;
}

const VENV = "app/.venv/Lib/site-packages";

// Benign stand-ins: same file names as the LiteLLM 1.107.0 IOCs, harmless content.
const SYNTHETIC_PTH = "# TwoToe eval fixture: synthetic stand-in, not the real payload\nimport os\n";
const SYNTHETIC_PY = "# TwoToe eval fixture: synthetic stand-in, not the real payload\n";

const FIXTURES: FixtureDef[] = [
  { name: "f01-litellm-bad-venv", condition: ".venv/.../litellm-1.107.0.dist-info",
    files: { [`${VENV}/litellm-1.107.0.dist-info/METADATA`]: "Metadata-Version: 2.1\nName: litellm\nVersion: 1.107.0\n" },
    expected: [{ advisoryId: "litellm-1.107.0", confidence: "definite" }] },
  { name: "f02-litellm-ioc", condition: "cook.pth + cook.py in site-packages",
    files: { [`${VENV}/cook.pth`]: SYNTHETIC_PTH, [`${VENV}/cook.py`]: SYNTHETIC_PY },
    expected: [{ advisoryId: "litellm-1.107.0", confidence: "definite" }] },
  { name: "f03-litellm-pin-only", condition: "requirements.txt pins 1.107.0, no venv",
    files: { "app/requirements.txt": "httpx==0.28.1\nlitellm==1.107.0\n" },
    expected: [{ advisoryId: "litellm-1.107.0", confidence: "likely" }] },
  { name: "f04-litellm-safe", condition: "1.106.2 installed",
    files: { [`${VENV}/litellm-1.106.2.dist-info/METADATA`]: "Metadata-Version: 2.1\nName: litellm\nVersion: 1.106.2\n" },
    expected: [] },
  { name: "f05-sitecustomize-only", condition: "legit-looking sitecustomize.py",
    files: { [`${VENV}/sitecustomize.py`]: "# set a UTF-8 default for this venv\nimport os\nos.environ.setdefault('PYTHONIOENCODING', 'utf-8')\n" },
    expected: [{ advisoryId: "litellm-1.107.0", confidence: "possible" }] },
  { name: "f06-railway-user", condition: "railway.toml + .env with RAILWAY_TOKEN",
    files: { "app/railway.toml": "[build]\nbuilder = \"nixpacks\"\n", "app/.env": `RAILWAY_TOKEN=fixture-not-a-token\n${CANARY_ENV}` },
    expected: [{ advisoryId: "railway-2026-10-21", confidence: "likely" }] },
  { name: "f07-railway-example-only", condition: ".env.example with RAILWAY_TOKEN",
    files: { "app/.env.example": "RAILWAY_TOKEN=\n" },
    expected: [] },
  { name: "f08-railway-comment", condition: "# RAILWAY_TOKEN= commented",
    files: { "app/.env": `# RAILWAY_TOKEN=fixture-not-a-token\n${CANARY_ENV}` },
    expected: [] },
  { name: "f09-opencode-cli", condition: "probe: opencode on PATH",
    probe: { commands: ["opencode"] },
    expected: [{ advisoryId: "opencode-console-2026-10-17", confidence: "possible" }] },
  { name: "f10-node-old-24", condition: "probe node 24.22.0",
    probe: { nodeVersion: "24.22.0" },
    expected: [{ advisoryId: "nodejs-2026-10-21", confidence: "definite" }] },
  { name: "f11-node-patched", condition: "probe node 24.22.1",
    probe: { nodeVersion: "24.22.1" },
    expected: [] },
  { name: "f12-node-docker-floating", condition: "FROM node:24-alpine",
    files: { "app/Dockerfile": "FROM node:24-alpine\nWORKDIR /app\nCOPY . .\nRUN npm ci\n" },
    expected: [{ advisoryId: "nodejs-2026-10-21", confidence: "likely" }] },
  { name: "f13-node-20", condition: "probe node 20.x (end-of-life line)",
    probe: { nodeVersion: "20.19.0" },
    expected: [{ advisoryId: "nodejs-2026-10-21", confidence: "likely" }] },
  { name: "f14-php-83-old", condition: "probe php 8.3.35",
    probe: { phpVersion: "8.3.35" },
    expected: [{ advisoryId: "php2shell-2026", confidence: "definite" }] },
  { name: "f15-php-81", condition: "probe php 8.1.30 (take offline)",
    probe: { phpVersion: "8.1.30" },
    expected: [{ advisoryId: "php2shell-2026", confidence: "definite" }] },
  { name: "f16-php-patched", condition: "probe php 8.4.27",
    probe: { phpVersion: "8.4.27" },
    expected: [] },
  { name: "f17-plex-old", condition: "probe plex 1.43.3.10860",
    probe: { plexVersion: "1.43.3.10860" },
    expected: [{ advisoryId: "plex2shell-2026", confidence: "definite" }] },
  { name: "f18-plex-patched", condition: "probe plex 1.43.3.10861",
    probe: { plexVersion: "1.43.3.10861" },
    expected: [] },
  // GitLab 19.4.1 is below both fixes: 19.4.3 (CVE-2026-110264) and 19.4.2 (CVE-2026-97229), per the GitLab posts.
  { name: "f19-gitlab-docker", condition: "gitlab/gitlab-ce:19.4.1-ce.0 in docker-compose.yml",
    files: { "app/docker-compose.yml": "services:\n  gitlab:\n    image: gitlab/gitlab-ce:19.4.1-ce.0\n    ports:\n      - \"8929:80\"\n" },
    expected: [
      { advisoryId: "gitlab-cve-2026-110264", confidence: "definite" },
      { advisoryId: "gitlab-cve-2026-97229", confidence: "definite" },
    ] },
  { name: "f20-emudhra-node-store", condition: "probe: node trust store contains emSign ECC Root CA - G3",
    probe: { trustStores: { "emSign ECC Root CA - G3": [{ store: "node", present: true }] } },
    expected: [{ advisoryId: "emudhra-weak-ca-keys", confidence: "likely" }] },
  { name: "f21-region-in", condition: "config region IN, nothing else",
    config: { region: "IN" },
    expected: [{ advisoryId: "sbi-2026-10-21", confidence: "fyi" }] },
  { name: "f22-kitchen-sink", condition: "f01 + f06 + f10 + f17",
    probe: { nodeVersion: "24.22.0", plexVersion: "1.43.3.10860" },
    files: {
      "ai/.venv/Lib/site-packages/litellm-1.107.0.dist-info/METADATA": "Metadata-Version: 2.1\nName: litellm\nVersion: 1.107.0\n",
      "rail/railway.toml": "[build]\nbuilder = \"nixpacks\"\n",
      "rail/.env": `RAILWAY_TOKEN=fixture-not-a-token\n${CANARY_ENV}`,
    },
    // Order per SPEC 7.4: Plex (critical, KEV due Oct 23) -5, LiteLLM 70, Railway 85, Node 170.
    expected: [
      { advisoryId: "plex2shell-2026", confidence: "definite" },
      { advisoryId: "litellm-1.107.0", confidence: "definite" },
      { advisoryId: "railway-2026-10-21", confidence: "likely" },
      { advisoryId: "nodejs-2026-10-21", confidence: "definite" },
    ],
    ordered: true },
  { name: "f23-clean-machine", condition: "everything patched",
    probe: { nodeVersion: "24.22.1", phpVersion: "8.3.36", plexVersion: "1.43.3.10861" },
    files: {
      "app/requirements.txt": "litellm==1.106.2\n",
      "app/Dockerfile": "FROM node:24.22.1-alpine\n",
      [`${VENV}/litellm-1.106.2.dist-info/METADATA`]: "Name: litellm\nVersion: 1.106.2\n",
    },
    expected: [],
    line1: "Nothing needs you today." },
  { name: "f24-clean-tricky", condition: "near-misses: 24.22.1, 8.3.36, 1.106.2, .env.sample, CHANGELOG mentioning CVEs",
    probe: { nodeVersion: "24.22.1", phpVersion: "8.3.36" },
    files: {
      [`${VENV}/litellm-1.106.2.dist-info/METADATA`]: "Name: litellm\nVersion: 1.106.2\n",
      "app/requirements.txt": "litellm==1.106.2\n",
      "app/.env.sample": "RAILWAY_TOKEN=\nOPENAI_API_KEY=\n",
      "app/CHANGELOG.md": "## 2026-10-22\n- Moved off litellm 1.107.0 (malicious) to 1.106.2.\n- Node 24.22.1 fixes CVE-2026-111497; PHP 8.3.36 fixes CVE-2026-109618.\n- Plex 1.43.3.10861 fixes CVE-2026-96652.\n",
      "app/package.json": JSON.stringify({ name: "app", engines: { node: ">=24.22.1" } }, null, 2),
      "app/Dockerfile": "FROM php:8.3.36-apache\n",
    },
    expected: [] },
];

function writeFile(full: string, content: string): void {
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

export function generate(root: string = ROOT): string[] {
  const done: string[] = [];
  for (const f of FIXTURES) {
    const dir = path.join(root, f.name);
    const expected: Expected = {
      fixture: f.name,
      condition: f.condition,
      findings: f.expected,
      ...(f.ordered ? { ordered: true } : {}),
      ...(f.line1 ? { line1: f.line1 } : {}),
    };
    const expectedText = `${JSON.stringify(expected, null, 2)}\n`;
    const expectedPath = path.join(dir, "expected.json");
    if (fs.existsSync(expectedPath) && fs.readFileSync(expectedPath, "utf8") !== expectedText && !force) {
      throw new Error(`${f.name}/expected.json differs from the spec table; refusing to overwrite ground truth (use --force only if SPEC 14.2 changed)`);
    }
    fs.rmSync(path.join(dir, "project"), { recursive: true, force: true });
    // Every fixture carries the canary in a real .env (SPEC 14.2 canary rule).
    const files: Record<string, string> = { "app/.env": CANARY_ENV, ...f.files };
    for (const [rel, content] of Object.entries(files)) writeFile(path.join(dir, "project", ...rel.split("/")), content);
    writeFile(path.join(dir, "probe.json"), `${JSON.stringify({ platform: "win32", ...f.probe }, null, 2)}\n`);
    const configPath = path.join(dir, "config.json");
    if (f.config) writeFile(configPath, `${JSON.stringify(f.config, null, 2)}\n`);
    else fs.rmSync(configPath, { force: true });
    writeFile(expectedPath, expectedText);
    done.push(f.name);
  }
  return done;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = generate();
  process.stdout.write(`wrote ${names.length} fixtures to eval/fixtures\n`);
}
