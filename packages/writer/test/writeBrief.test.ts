import { describe, expect, it } from "vitest";
import type { ChatRequest, ChatResult, ModelClient } from "../src/ollama";
import { templateDraft } from "../src/template";
import { BRIEF_DRAFT_SCHEMA, writeDraft } from "../src/writeBrief";
import { goodDraft, kitchenFindings, pack, ROOTS } from "./fixtures";

// Mocked Ollama: returns queued replies (strings or thrown errors) and keeps the requests.
class FakeClient implements ModelClient {
  readonly requests: ChatRequest[] = [];
  constructor(private readonly replies: Array<string | Error>) {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    this.requests.push(req);
    const next = this.replies.shift();
    if (next === undefined) throw new Error("no more replies");
    if (next instanceof Error) throw next;
    return { content: next, wallMs: 5, promptEvalCount: 100, evalCount: 50 };
  }
}

const findings = kitchenFindings();
const id = (adv: string) => findings.find((f) => f.advisoryId === adv)!.id;
const write = (client: FakeClient) => writeDraft({ findings, pack, date: "2026-10-23", roots: ROOTS, client, model: "gemma4:e4b" });

function modelDraft() {
  const d = goodDraft(findings);
  d.line2Tail = "go back to sleep";
  d.checklist.find((c) => c.findingId === id("nodejs-2026-10-21"))!.why = "The Oct 21 Node release fixes a Brotli decoder bug.";
  return d;
}

describe("writeDraft with a mocked model (SPEC 10.5 retry policy)", () => {
  it("valid draft on the first try -> llm, 1 attempt, no rejections", async () => {
    const client = new FakeClient([JSON.stringify(modelDraft())]);
    const r = await write(client);
    expect([r.mode, r.attempts, r.rejections]).toEqual(["llm", 1, []]);
    expect(r.draft.line2Tail).toBe("go back to sleep");
    expect(client.requests[0]!.think).toBe(false);
    expect(client.requests[0]!.schema).toBe(BRIEF_DRAFT_SCHEMA);
  });

  it("invalid then valid -> llm on attempt 2, reasons sent back and recorded", async () => {
    const bad = modelDraft();
    bad.checklist.find((c) => c.findingId === id("nodejs-2026-10-21"))!.action = "Upgrade Node to 24.23.0";
    const client = new FakeClient([JSON.stringify(bad), JSON.stringify(modelDraft())]);
    const r = await write(client);
    expect([r.mode, r.attempts]).toEqual(["llm", 2]);
    expect(r.rejections).toEqual([`attempt 1: ungrounded token "24.23.0" in ${id("nodejs-2026-10-21")}`]);
    expect(client.requests[1]!.user).toContain("Your previous draft was rejected for:");
    expect(client.requests[1]!.user).toContain('ungrounded token "24.23.0"');
    expect(client.requests[0]!.user).not.toContain("rejected");
  });

  it("invalid twice -> llm-fallback: keeps valid items, templates only the failing ones", async () => {
    const bad = modelDraft();
    bad.checklist.find((c) => c.findingId === id("nodejs-2026-10-21"))!.why = "Fixes CVE-2026-424242.";
    bad.line2Tail = "all 400 checks passed";
    const client = new FakeClient([JSON.stringify(bad), JSON.stringify(bad)]);
    const r = await write(client);
    expect([r.mode, r.attempts]).toEqual(["llm-fallback", 2]);
    // Per attempt: the invented CVE, its bare number, and the digits in the tail.
    expect(r.rejections).toHaveLength(6);
    expect(r.fallbackParts).toEqual([id("nodejs-2026-10-21"), "line2Tail"]);
    const template = templateDraft(findings, pack);
    expect(r.draft.checklist.find((c) => c.findingId === id("nodejs-2026-10-21"))).toEqual(
      template.checklist.find((c) => c.findingId === id("nodejs-2026-10-21")));
    expect(r.draft.line2Tail).toBe(template.line2Tail);
    expect(r.draft.line1Actions).toEqual(bad.line1Actions);
  });

  it("non-JSON twice -> full template, mode llm-fallback", async () => {
    const r = await write(new FakeClient(["Sure! Here is your brief:", "```json\n{}\n```"]));
    expect([r.mode, r.fallbackParts]).toEqual(["llm-fallback", ["all"]]);
    expect(r.rejections).toEqual(["attempt 1: output is not valid JSON", "attempt 2: output is not valid JSON"]);
    expect(r.draft).toEqual(templateDraft(findings, pack));
  });

  it("schema mismatch is a rejection, not a crash", async () => {
    const r = await write(new FakeClient([JSON.stringify({ line1Actions: "x" }), JSON.stringify(modelDraft())]));
    expect(r.mode).toBe("llm");
    expect(r.rejections[0]).toMatch(/^attempt 1: output does not match the schema/);
  });

  it("model down -> template, one attempt, reason recorded", async () => {
    const r = await write(new FakeClient([new TypeError("fetch failed")]));
    expect([r.mode, r.attempts, r.rejections]).toEqual(["llm-fallback", 1, ["attempt 1: model call failed: fetch failed"]]);
  });

  it("nothing found -> no model call at all", async () => {
    const client = new FakeClient([]);
    const r = await writeDraft({ findings: [], pack, date: "2026-10-23", roots: ROOTS, client, model: "gemma4:e4b" });
    expect([r.mode, r.model, client.requests.length]).toEqual(["template", null, 0]);
  });

  it("puts the checklist back in priority order and fixes line-1 casing", async () => {
    const d = modelDraft();
    d.checklist.reverse();
    d.line1Actions = ["Update Plex to 1.43.3.10861", d.line1Actions[1]!];
    const r = await write(new FakeClient([JSON.stringify(d)]));
    expect(r.mode).toBe("llm");
    expect(r.draft.checklist.map((c) => c.findingId)).toEqual(goodDraft(findings).checklist.map((c) => c.findingId));
    expect(r.draft.line1Actions[0]).toBe("update Plex to 1.43.3.10861");
  });

  it("drops extra line-1 actions and FYI text the brief does not call for, then validates the rest", async () => {
    const possibleOnly = findings.filter((f) => f.confidence === "possible");
    const d = { ...goodDraft(possibleOnly), line1Actions: ["confirm your OpenCode keys"], fyi: ["OpenCode said 1.4% of Console users were affected."] };
    const r = await writeDraft({ findings: possibleOnly, pack, date: "2026-10-23", roots: ROOTS, client: new FakeClient([JSON.stringify(d)]), model: "gemma4:e4b" });
    expect([r.mode, r.rejections]).toEqual(["llm", []]);
    expect(r.draft.line1Actions).toEqual([]);
    expect(r.draft.fyi).toEqual([]);
  });

  it("still rejects too few line-1 actions and ungrounded text in the kept ones", async () => {
    const d = modelDraft();
    d.line1Actions = ["bump Node to 24.22.1", "and more"];   // Node is not in the top two
    const tooFew = { ...modelDraft(), line1Actions: [modelDraft().line1Actions[0]!] };
    const r = await write(new FakeClient([JSON.stringify(d), JSON.stringify(tooFew)]));
    expect(r.rejections.some((x) => x.includes('ungrounded token "24.22.1" in line1Actions'))).toBe(true);
    expect(r.rejections.some((x) => x.includes("line1Actions has 1 item(s), expected 2"))).toBe(true);
  });

  it("the JSON schema handed to Ollama describes BriefDraft", () => {
    expect(BRIEF_DRAFT_SCHEMA).toMatchObject({
      type: "object",
      required: ["line1Actions", "line2Tail", "checklist", "fyi"],
      properties: { line1Actions: { type: "array", maxItems: 2 } },
    });
    expect(BRIEF_DRAFT_SCHEMA).not.toHaveProperty("$schema");
  });
});
