import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { loadPack } from "@twotoe/core";
import { FORCED_REJECTION, templateDraft, type ChatRequest, type ChatResult, type ModelClient } from "@twotoe/writer";
import { afterAll, describe, expect, it } from "vitest";
import { makeBrief, resolveTelemetry, TelemetryConfigError } from "../src/commands/brief";

const CANARY = "TWOTOE_CANARY_9f3a";
const NOW = new Date(2026, 9, 23, 7, 0);
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

function kitchen(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "twotoe-tele-"));
  dirs.push(dir);
  const files: Record<string, string> = {
    "probe.json": JSON.stringify({ nodeVersion: "24.22.0", plexVersion: "1.43.3.10860" }),
    "project/ai/.venv/Lib/site-packages/litellm-1.107.0.dist-info/METADATA": "Name: litellm\n",
    "project/rail/.env": `RAILWAY_TOKEN=x\nSECRET_VALUE=${CANARY}\n`,
    "project/rail/railway.toml": "",
  };
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

// A stand-in model that always returns the template draft (which validates).
class TemplateModel implements ModelClient {
  constructor(private readonly content: string) {}
  async chat(_req: ChatRequest): Promise<ChatResult> {
    return { content: this.content, wallMs: 5, promptEvalCount: 2600, evalCount: 450, evalDurationMs: 20_000 };
  }
}

interface SpanRec { op: string; status: string; data: Record<string, unknown> }

// Pulls spans out of Sentry envelopes: transaction events and streamed span items.
function spansFrom(bodies: string[]): SpanRec[] {
  const out: SpanRec[] = [];
  const flat = (attrs: Record<string, unknown>) => Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, v && typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : v]));
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    const r = o as Record<string, unknown>;
    if (r.type === "transaction") {
      const t = (r.contexts as { trace?: { op?: string; status?: string; data?: Record<string, unknown> } })?.trace;
      if (t?.op) out.push({ op: t.op, status: t.status ?? "", data: t.data ?? {} });
      for (const s of (r.spans as Array<{ op?: string; status?: string; data?: Record<string, unknown> }>) ?? []) out.push({ op: s.op ?? "", status: s.status ?? "", data: s.data ?? {} });
      return;
    }
    if (r.attributes && typeof r.attributes === "object" && "sentry.op" in (r.attributes as object)) {
      const data = flat(r.attributes as Record<string, unknown>);
      out.push({ op: String(data["sentry.op"]), status: String(r.status ?? ""), data });
      return;
    }
    Object.values(r).forEach(walk);
  };
  for (const b of bodies) for (const line of b.split("\n")) { if (line.trim()) { try { walk(JSON.parse(line)); } catch { /* binary item */ } } }
  return out;
}

async function fakeSentry(): Promise<{ dsn: string; bodies: string[]; close: () => void }> {
  const bodies: string[] = [];
  const server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => { b += c; });
    req.on("end", () => { bodies.push(b); res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const { port } = server.address() as AddressInfo;
  return { dsn: `http://publickey@127.0.0.1:${port}/42`, bodies, close: () => server.close() };
}

async function demoRun(content: boolean) {
  const fx = kitchen();
  const pre = await makeBrief([], { fixture: fx, llm: false, now: NOW, userConfig: {} });
  const model = new TemplateModel(JSON.stringify(templateDraft(pre.findings, loadPack())));
  const sentry = await fakeSentry();
  const res = await makeBrief([], {
    fixture: fx, now: NOW, client: model, forceRejectFirst: true,
    ...(content ? { traceContent: "demo" as const } : {}),
    userConfig: { telemetry: { sentry: true, dsn: sentry.dsn } },
  });
  sentry.close();
  return { res, bodies: sentry.bodies, spans: spansFrom(sentry.bodies) };
}

describe("Sentry agent tracing (SPEC 11.4)", () => {
  it("demo trace: scan, match, invoke_agent, two chat attempts, the first rejected", async () => {
    const { res, bodies, spans } = await demoRun(false);
    const ops = spans.map((s) => s.op);
    if (!ops.includes("gen_ai.chat")) throw new Error(`no gen_ai spans; envelopes:\n${bodies.join("\n---\n").slice(0, 3000)}`);
    for (const op of ["twotoe.brief", "twotoe.scan", "twotoe.match", "gen_ai.invoke_agent", "twotoe.assemble"]) expect(ops).toContain(op);
    expect(ops.filter((o) => o === "gen_ai.chat")).toHaveLength(2);
    const tools = spans.filter((s) => s.op === "gen_ai.execute_tool");
    expect(tools).toHaveLength(2);
    expect(tools.filter((t) => /error|internal_error/.test(t.status))).toHaveLength(1);
    const chat = spans.find((s) => s.op === "gen_ai.chat")!;
    expect(chat.data).toMatchObject({ "gen_ai.operation.name": "chat", "gen_ai.provider.name": "ollama", "gen_ai.request.model": "gemma4:e4b", "gen_ai.usage.input_tokens": 2600, "gen_ai.usage.output_tokens": 450 });
    expect(chat.data["gen_ai.input.messages"]).toBeUndefined();
    expect(chat.data["gen_ai.output.messages"]).toBeUndefined();
    expect(res.brief.meta).toMatchObject({ mode: "llm", attempts: 2 });
    expect(res.brief.meta.validatorRejections).toEqual([`attempt 1: ${FORCED_REJECTION}`]);
    expect(res.traceId).toMatch(/^[0-9a-f]{32}$/);
    // The trace upload is on the brief's own network ledger.
    expect(res.brief.meta.egress.some((e) => e.host === "127.0.0.1" && e.method === "POST" && e.bytesOut > 0)).toBe(true);
    const all = bodies.join("\n");
    expect(all).not.toContain(CANARY);
    expect(all).not.toMatch(/[A-Za-z]:\\\\Users\\\\|\/home\/|\/Users\//);
    expect(all).not.toContain(os.hostname());
  }, 60_000);

  it("demo content mode attaches the prompt and response, still scrubbed", async () => {
    const { spans, bodies } = await demoRun(true);
    const chat = spans.find((s) => s.op === "gen_ai.chat")!;
    expect(String(chat.data["gen_ai.input.messages"])).toContain("FINDINGS (ordered by priority, already verified)");
    expect(String(chat.data["gen_ai.output.messages"])).toContain("line1Actions");
    expect(String(chat.data["gen_ai.system_instructions"])).toContain("You are TwoToe");
    expect(bodies.join("\n")).not.toContain(CANARY);
  }, 60_000);

  it("telemetry off sends nothing at all", async () => {
    const sentry = await fakeSentry();
    const fx = kitchen();
    const res = await makeBrief([], { fixture: fx, llm: false, now: NOW, userConfig: { telemetry: { sentry: false, dsn: sentry.dsn } } });
    sentry.close();
    expect(sentry.bodies).toEqual([]);
    expect(res.traceId).toBeNull();
    expect(res.brief.meta.egress).toEqual([]);
  });

  it("refuses demo options outside fixtures and telemetry without a DSN", () => {
    expect(() => resolveTelemetry({}, { forceRejectFirst: true })).toThrow(TelemetryConfigError);
    expect(() => resolveTelemetry({}, { traceContent: "demo" })).toThrow(/fixtures only|only runs on fixtures/);
    expect(() => resolveTelemetry({ sentry: true }, {})).toThrow(/no telemetry.dsn/);
    expect(resolveTelemetry({ dsn: "https://k@o1.ingest.sentry.io/2" }, {})).toBeNull();
    expect(resolveTelemetry({ dsn: "https://k@o1.ingest.sentry.io/2" }, { telemetry: true })).toEqual({ dsn: "https://k@o1.ingest.sentry.io/2", content: false });
  });
});
