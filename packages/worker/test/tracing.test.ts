import { describe, expect, it } from "vitest";
import { ingestHostOf, scrubAttributes, scrubEvent, scrubStreamedSpan, unsafeValue } from "../src/tracing";

describe("trace scrub hooks (SPEC 11.4)", () => {
  it("flags home paths, env key names and the canary", () => {
    for (const v of ["C:\\Users\\alice\\code\\.env", "C:\\\\Users\\\\alice", "/Users/bob/src", "/home/carol/x", "RAILWAY_TOKEN", "OPENAI_API_KEY", "x TWOTOE_CANARY_9f3a y", ["/home/dan"]]) {
      expect(unsafeValue(v)).toBe(true);
    }
    for (const v of ["gemma4:e4b", "chat gemma4:e4b", "Upgrade Node from 24.22.0 to 24.22.1", "~\\code\\rail\\.env", 12, true, "groundingValidator", "Railway"]) {
      expect(unsafeValue(v)).toBe(false);
    }
  });

  it("removes only the unsafe attributes", () => {
    const attrs: Record<string, unknown> = { "gen_ai.request.model": "gemma4:e4b", "x.path": "C:\\Users\\alice\\a.txt", "x.key": "RAILWAY_TOKEN", "gen_ai.usage.input_tokens": 2619 };
    expect(scrubAttributes(attrs)).toBe(2);
    expect(attrs).toEqual({ "gen_ai.request.model": "gemma4:e4b", "gen_ai.usage.input_tokens": 2619 });
  });

  it("scrubs transaction events and streamed spans, and pins server_name", () => {
    const event = scrubEvent({
      server_name: "LAPTOP-REAL-NAME",
      contexts: { trace: { data: { ok: 1, bad: "/home/eve/x" } }, device: { hostname: "LAPTOP-REAL-NAME" } },
      spans: [{ data: { bad: "C:\\Users\\eve\\x", ok: "chat" }, description: "read C:\\Users\\eve\\file" }],
    });
    expect(event.server_name).toBe("twotoe");
    expect(event.contexts?.device).toBeUndefined();
    expect(event.contexts?.trace?.data).toEqual({ ok: 1 });
    expect(event.spans![0]!.data).toEqual({ ok: "chat" });
    expect(event.spans![0]!.description).toBe("read ~\\file");
    const span = scrubStreamedSpan({ name: "open /Users/zed/a", attributes: { a: "/Users/zed/b", b: "fine" } });
    expect(span).toEqual({ name: "open ~/a", attributes: { b: "fine" } });
  });

  it("derives the ingest host from a DSN", () => {
    expect(ingestHostOf("https://abc@o123.ingest.us.sentry.io/456")).toBe("o123.ingest.us.sentry.io");
  });
});
