import { LOOPBACK_HOSTS, normalizeHost } from "@twotoe/core";

// SPEC 10.1. Every call uses the global fetch at call time, so it always goes
// through the egress guard when one is installed.

export const DEFAULT_MODEL = "gemma4:e4b";
export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
export const DEFAULT_TIMEOUT_MS = 90_000;    // first call may load the model

export class ModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigError";
  }
}

// Cloud-hosted Ollama tags (gemma4:cloud, *-cloud) would send findings off the machine.
export function isRemoteModelTag(tag: string): boolean {
  return /cloud|remote/i.test(tag);
}

// Precedence: --model > TWOTOE_MODEL > config.json model > default.
// TWOTOE_MODEL is the only environment variable TwoToe reads (SPEC 10.1,
// docs/DECISIONS.md). No other env value is touched.
export function resolveModel(opts: { flag?: string | undefined; config?: string | null | undefined } = {}): string {
  const fromEnv = process.env.TWOTOE_MODEL;
  const pick = [opts.flag, fromEnv, opts.config ?? undefined, DEFAULT_MODEL].find((m) => typeof m === "string" && m.trim() !== "")!;
  const model = pick.trim();
  if (isRemoteModelTag(model)) throw new ModelConfigError(`refusing remote model tag "${model}": TwoToe only runs local models`);
  return model;
}

export interface ChatRequest {
  model: string;
  system: string;
  user: string;
  schema: object;
  think?: boolean;
  timeoutMs?: number;
}

export interface ChatResult {
  content: string;
  wallMs: number;
  promptEvalCount?: number;
  evalCount?: number;
  totalDurationMs?: number;
  loadDurationMs?: number;
}

export interface ModelClient {
  chat(req: ChatRequest): Promise<ChatResult>;
}

export class OllamaClient implements ModelClient {
  readonly baseUrl: string;

  constructor(baseUrl: string = DEFAULT_OLLAMA_URL) {
    const host = normalizeHost(new URL(baseUrl).hostname);
    if (!LOOPBACK_HOSTS.has(host)) throw new ModelConfigError(`Ollama must be on loopback, got ${host}`);
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const started = Date.now();
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      body: JSON.stringify({
        model: req.model,
        stream: false,
        format: req.schema,
        think: req.think ?? false,
        options: { temperature: 0.2, seed: 42, num_ctx: 8192 },
        messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }],
      }),
    });
    const body = await res.json().catch(() => ({})) as {
      message?: { content?: string }; error?: string;
      prompt_eval_count?: number; eval_count?: number; total_duration?: number; load_duration?: number;
    };
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}${body.error ? `: ${String(body.error).slice(0, 120)}` : ""}`);
    return {
      content: body.message?.content ?? "",
      wallMs: Date.now() - started,
      ...(body.prompt_eval_count !== undefined ? { promptEvalCount: body.prompt_eval_count } : {}),
      ...(body.eval_count !== undefined ? { evalCount: body.eval_count } : {}),
      ...(body.total_duration !== undefined ? { totalDurationMs: Math.round(body.total_duration / 1e6) } : {}),
      ...(body.load_duration !== undefined ? { loadDurationMs: Math.round(body.load_duration / 1e6) } : {}),
    };
  }
}
