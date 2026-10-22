import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { EXIT_ACTIONS, EXIT_ERROR, EXIT_NOTHING, headerDate, makeBrief, renderBrief, runBrief } from "../src/commands/brief";

const CANARY = "TWOTOE_CANARY_9f3a";
const NOW = new Date(2026, 9, 23, 7, 0);   // local Fri Oct 23, 07:00 (the SPEC 12 mockup says "Thu", but Oct 23, 2026 is a Friday)
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
afterEach(() => vi.restoreAllMocks());

function fixture(files: Record<string, string>, probe: object, config?: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "twotoe-brief-"));
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, "project"), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, "project", ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  fs.writeFileSync(path.join(dir, "probe.json"), JSON.stringify(probe));
  if (config) fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config));
  return dir;
}

// f01 + f06 + f10 + f17 (+ region IN for an FYI line)
const kitchen = () => fixture({
  "ai/.venv/Lib/site-packages/litellm-1.107.0.dist-info/METADATA": "Name: litellm\n",
  "ai/.env": `SECRET_VALUE=${CANARY}\n`,
  "rail/.env": `RAILWAY_TOKEN=${CANARY}\nSECRET_VALUE=${CANARY}\n`,
  "rail/railway.toml": "[build]\n",
}, { nodeVersion: "24.22.0", plexVersion: "1.43.3.10860" }, { region: "IN" });

describe("twotoe brief --no-llm", () => {
  it("renders the SPEC 12 layout", async () => {
    const res = await makeBrief([], { fixture: kitchen(), llm: false, now: NOW });
    const text = renderBrief(res, NOW, false);
    const lines = text.split("\n");
    expect(lines[0]).toBe("  twotoe  Fri Oct 23, 07:00");
    expect(lines[2]).toBe("  4 things need you today: update Plex to 1.43.3.10861; rebuild your litellm env on 1.106.2; +2 more in the checklist.");
    expect(lines[3]).toMatch(/^ {2}Everything else: you're fine\. Checked \d+ things in \d+\.\d{1,2}s, 0 secrets left this machine\.$/);
    expect(lines.filter((l) => l.startsWith("  [ ] "))).toHaveLength(4);
    expect(text).toContain("likely    railway.toml, .env (RAILWAY_TOKEN)");
    expect(text).toContain("definite  node --version");
    expect(text).toMatch(/ {2}FYI {2}SBI disclosed/);
    expect(text).not.toContain(CANARY);
    expect(res.exitCode).toBe(EXIT_ACTIONS);
  });

  it("exits 0 with 'Nothing needs you today.' on a clean machine", async () => {
    const res = await makeBrief([], { fixture: fixture({ "a/.env.sample": "RAILWAY_TOKEN=\n" }, { nodeVersion: "24.22.1", phpVersion: "8.3.36", plexVersion: "1.43.3.10861" }), llm: false, now: NOW });
    expect(res.brief.line1).toBe("Nothing needs you today.");
    expect(res.exitCode).toBe(EXIT_NOTHING);
  });

  it("model path: a fake Ollama on loopback, through the guard, offline", async () => {
    // Echo the template back as the "model" draft, with a different tail.
    const { templateDraft } = await import("@twotoe/writer");
    const { loadPack } = await import("@twotoe/core");
    const fx = kitchen();   // finding ids hash evidence paths, so reuse one fixture dir
    const pre = await makeBrief([], { fixture: fx, llm: false, now: NOW });
    const draft = { ...templateDraft(pre.findings, loadPack()), line2Tail: "go back to sleep" };
    const server = http.createServer((req, res) => {
      req.resume();
      req.on("end", () => res.end(JSON.stringify({ message: { content: JSON.stringify(draft) }, eval_count: 1 })));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const { port } = server.address() as AddressInfo;
    const { OllamaClient } = await import("@twotoe/writer");
    const res = await makeBrief([], { fixture: fx, now: NOW, offline: true, client: new OllamaClient(`http://127.0.0.1:${port}`) });
    server.close();
    expect(res.brief.meta).toMatchObject({ mode: "llm", model: "gemma4:e4b", attempts: 1, validatorRejections: [] });
    expect(res.brief.line2).toMatch(/^Everything else: go back to sleep\. Checked/);
    expect(res.brief.meta.egress.map((e) => `${e.host} ${e.method}`)).toEqual(["127.0.0.1 POST"]);
    expect(renderBrief(res, NOW, false)).toContain("model: gemma4:e4b (llm)   validator: 0 rejections");
  });

  it("refuses a cloud model tag with a clear message", async () => {
    let err = "";
    vi.spyOn(process.stderr, "write").mockImplementation(((s: string) => { err += s; return true; }) as typeof process.stderr.write);
    expect(await runBrief([], { fixture: kitchen(), model: "gemma4:cloud" })).toBe(EXIT_ERROR);
    expect(err).toContain('refusing remote model tag "gemma4:cloud"');
  });

  it("--json prints a redacted brief and findings with no canary", async () => {
    let out = "";
    vi.spyOn(process.stdout, "write").mockImplementation(((s: string) => { out += s; return true; }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, "write").mockImplementation((() => true) as typeof process.stderr.write);
    const code = await runBrief([], { fixture: kitchen(), llm: false, json: true, now: NOW });
    const parsed = JSON.parse(out) as { brief: { meta: { mode: string } }; findings: unknown[] };
    expect(code).toBe(EXIT_ACTIONS);
    expect(parsed.brief.meta.mode).toBe("template");
    expect(parsed.findings).toHaveLength(5);
    expect(out).not.toContain(CANARY);
    expect(out.toLowerCase()).not.toContain(os.homedir().toLowerCase().replace(/\\/g, "\\\\"));
  });

  it("formats the header date", () => {
    expect(headerDate(NOW)).toBe("Fri Oct 23, 07:00");
  });
});
