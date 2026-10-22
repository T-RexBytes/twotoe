import http from "node:http";
import type { AddressInfo } from "node:net";
import { installEgressGuard, Ledger } from "@twotoe/core";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_MODEL, ModelConfigError, OllamaClient, resolveModel } from "../src/ollama";

const realEnv = process.env;
let uninstall: (() => void) | null = null;
afterEach(() => {
  process.env = realEnv;
  uninstall?.();
  uninstall = null;
});

// Replaces process.env with a proxy that records which keys are read.
function watchEnv(values: Record<string, string> = {}): Set<string> {
  const read = new Set<string>();
  const base: NodeJS.ProcessEnv = { ...values };
  process.env = new Proxy(base, {
    get(t, k) { if (typeof k === "string") read.add(k); return Reflect.get(t, k); },
    has(t, k) { if (typeof k === "string") read.add(k); return Reflect.has(t, k); },
  });
  return read;
}

describe("resolveModel (docs/DECISIONS.md)", () => {
  it("precedence: --model > TWOTOE_MODEL > config > default", () => {
    watchEnv({ TWOTOE_MODEL: "gemma4:e2b" });
    expect(resolveModel({ flag: "qwen3:4b", config: "x:1b" })).toBe("qwen3:4b");
    expect(resolveModel({ config: "x:1b" })).toBe("gemma4:e2b");
    watchEnv({});
    expect(resolveModel({ config: "x:1b" })).toBe("x:1b");
    expect(resolveModel()).toBe(DEFAULT_MODEL);
    watchEnv({ TWOTOE_MODEL: "  " });
    expect(resolveModel()).toBe(DEFAULT_MODEL);
  });

  it("refuses cloud and remote tags from any source", () => {
    watchEnv({ TWOTOE_MODEL: "gemma4:cloud" });
    expect(() => resolveModel()).toThrow(ModelConfigError);
    watchEnv({});
    expect(() => resolveModel({ flag: "gpt-oss:120b-cloud" })).toThrow(/refusing remote model tag/);
    expect(() => resolveModel({ config: "remote/model" })).toThrow(ModelConfigError);
  });

  it("reads TWOTOE_MODEL and no other environment variable", () => {
    const read = watchEnv({ TWOTOE_MODEL: "gemma4:e4b", OPENAI_API_KEY: "TWOTOE_CANARY_9f3a" });
    resolveModel({ config: "x" });
    expect([...read]).toEqual(["TWOTOE_MODEL"]);
  });
});

describe("OllamaClient", () => {
  it("refuses a non-loopback Ollama URL", () => {
    expect(() => new OllamaClient("http://192.168.1.20:11434")).toThrow(ModelConfigError);
    expect(() => new OllamaClient("https://ollama.example.com")).toThrow(ModelConfigError);
    expect(new OllamaClient("http://localhost:11434").baseUrl).toBe("http://localhost:11434");
  });

  it("sends the SPEC 10.1 request through the egress guard", async () => {
    let seen: Record<string, unknown> = {};
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        seen = JSON.parse(body) as Record<string, unknown>;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ message: { content: "{\"ok\":true}" }, prompt_eval_count: 12, eval_count: 3, total_duration: 2_000_000, load_duration: 1_000_000 }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const { port } = server.address() as AddressInfo;
    const ledger = new Ledger();
    uninstall = installEgressGuard({ ledger, offline: true });
    const client = new OllamaClient(`http://127.0.0.1:${port}`);
    const res = await client.chat({ model: "gemma4:e4b", system: "S", user: "U", schema: { type: "object" } });
    server.close();
    expect(res).toMatchObject({ content: "{\"ok\":true}", promptEvalCount: 12, evalCount: 3, totalDurationMs: 2, loadDurationMs: 1 });
    expect(seen).toMatchObject({
      model: "gemma4:e4b", stream: false, think: false, format: { type: "object" },
      options: { temperature: 0.2, seed: 42, num_ctx: 8192 },
      messages: [{ role: "system", content: "S" }, { role: "user", content: "U" }],
    });
    const entries = ledger.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ host: "127.0.0.1", method: "POST" });
    expect(entries[0]!.bytesOut).toBeGreaterThan(50);
    expect(ledger.nonLocal()).toEqual([]);
  });

  it("surfaces an HTTP error with a short message", async () => {
    const server = http.createServer((_req, res) => { res.statusCode = 404; res.end(JSON.stringify({ error: "model \"nope\" not found" })); });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const { port } = server.address() as AddressInfo;
    await expect(new OllamaClient(`http://127.0.0.1:${port}`).chat({ model: "nope", system: "", user: "", schema: {} }))
      .rejects.toThrow('ollama HTTP 404: model "nope" not found');
    server.close();
  });
});
