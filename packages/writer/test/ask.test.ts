import { describe, expect, it } from "vitest";
import { askQuestion, askUserPrompt, DONT_KNOW, templateAnswer, validateAnswer } from "../src/ask";
import type { ChatRequest, ChatResult, ModelClient } from "../src/ollama";
import { kevOf, kitchenFindings, pack } from "./fixtures";

const findings = kitchenFindings();
const node = findings.find((f) => f.advisoryId === "nodejs-2026-10-21")!;
const plex = findings.find((f) => f.advisoryId === "plex2shell-2026")!;

class Scripted implements ModelClient {
  readonly requests: ChatRequest[] = [];
  constructor(private readonly replies: Array<string | Error>) {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    this.requests.push(req);
    const r = this.replies.shift() ?? new Error("no more replies");
    if (r instanceof Error) throw r;
    return { content: r, wallMs: 1 };
  }
}
const reply = (answer: string, findingIds: string[]) => JSON.stringify({ answer, findingIds });

describe("ask: grounding validator for answers", () => {
  it("accepts an answer whose facts are all in the cited finding's allowed tokens", () => {
    expect(validateAnswer({ answer: "Your Node 24.22.0 is missing the Oct 21 fixes; upgrade to 24.22.1.", findingIds: [node.id] }, findings, kevOf)).toEqual([]);
  });

  it("rejects an invented version, an unknown id, and an uncited answer", () => {
    expect(validateAnswer({ answer: "Upgrade Node to 24.23.0.", findingIds: [node.id] }, findings, kevOf)).toContain('ungrounded token "24.23.0"');
    expect(validateAnswer({ answer: "Upgrade Node.", findingIds: ["nodejs:made-up"] }, findings, kevOf)).toEqual(["unknown findingId nodejs:made-up", "no finding cited", 'ungrounded token "Node"']);
    // Facts from another finding do not count unless that finding is cited.
    expect(validateAnswer({ answer: "Plex 1.43.3.10861 fixes it.", findingIds: [node.id] }, findings, kevOf)).toContain('ungrounded token "1.43.3.10861"');
  });

  it("gates hype words by the cited findings' severity and KEV status", () => {
    expect(validateAnswer({ answer: "This Node gap is urgent.", findingIds: [node.id] }, findings, kevOf)).toContain('hype word "urgent"');
    expect(validateAnswer({ answer: "Plex flaws are actively exploited and critical.", findingIds: [plex.id] }, findings, kevOf)).toEqual([]);
    expect(validateAnswer({ answer: "Node flaws are actively exploited.", findingIds: [node.id] }, findings, kevOf)).toEqual(expect.arrayContaining(['hype word "actively"', 'hype word "exploited"']));
  });

  it("the don't-know answer passes only without citations", () => {
    expect(validateAnswer({ answer: DONT_KNOW, findingIds: [] }, findings, kevOf)).toEqual([]);
    expect(validateAnswer({ answer: DONT_KNOW, findingIds: [node.id] }, findings, kevOf)).toHaveLength(1);
  });
});

describe("ask: model loop", () => {
  it("valid first draft: mode llm, one attempt", async () => {
    const client = new Scripted([reply("Node 24.22.0 lacks the Oct 21 fixes; upgrade to 24.22.1.", [node.id])]);
    const r = await askQuestion({ question: "why does the Node one matter?", findings, pack, client, model: "m" });
    expect(r).toMatchObject({ mode: "llm", attempts: 1, rejections: [], findingIds: [node.id] });
    expect(client.requests[0]!.user).toContain("QUESTION: why does the Node one matter?");
    expect(client.requests[0]!.user).not.toMatch(/[A-Za-z]:\\Users\\/);
  });

  it("invalid then valid: the retry carries the rejection reasons", async () => {
    const client = new Scripted([reply("Upgrade Node to 24.30.0.", [node.id]), reply("Upgrade Node to 24.22.1.", [node.id])]);
    const r = await askQuestion({ question: "what Node do I need?", findings, pack, client, model: "m" });
    expect(r).toMatchObject({ mode: "llm", attempts: 2 });
    // The bare "30" inside the version is flagged too (SPEC 10.5 bare-number rule).
    expect(r.rejections).toEqual(['attempt 1: ungrounded token "24.30.0"', 'attempt 1: ungrounded token "30"']);
    expect(client.requests[1]!.user).toContain('rejected for: ungrounded token "24.30.0"');
  });

  it("invalid twice or model down: answered from the findings by code", async () => {
    const twice = await askQuestion({ question: "tell me about plex", findings, pack, client: new Scripted(["not json", reply("Plex 9.9.9", [plex.id])]), model: "m" });
    expect(twice).toMatchObject({ mode: "template", attempts: 2, findingIds: [plex.id] });
    expect(twice.answer).toContain("1.43.3.10861");
    const down = await askQuestion({ question: "and the weather?", findings, pack, client: new Scripted([new Error("ECONNREFUSED")]), model: "m" });
    expect(down).toMatchObject({ mode: "template", findingIds: [] });
    expect(down.answer).toMatch(/^I can only answer about tonight's findings/);
  });

  it("no findings: no model call", async () => {
    const client = new Scripted([]);
    const r = await askQuestion({ question: "anything?", findings: [], pack, client, model: "m" });
    expect(client.requests).toHaveLength(0);
    expect(r).toMatchObject({ mode: "template", attempts: 0, answer: "Tonight's scan found nothing to explain." });
  });

  it("long questions are cut before they reach the model", () => {
    expect(askUserPrompt("x".repeat(2000), findings, pack)).toContain(`QUESTION: ${"x".repeat(500)}\n`);
    expect(templateAnswer("railway?", findings, pack).findingIds).toHaveLength(1);
  });
});
