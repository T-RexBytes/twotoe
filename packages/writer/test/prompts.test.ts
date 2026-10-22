import { describe, expect, it } from "vitest";
import { buildUserPrompt, expectedCounts, modelFinding, relativeLocation, SYSTEM } from "../src/prompts";
import { kitchenFindings, pack, ROOTS } from "./fixtures";

describe("prompts", () => {
  it("system prompt carries SPEC 10.2 verbatim, plus the 10.4 few-shot", () => {
    expect(SYSTEM.startsWith("You are TwoToe, a calm morning security assistant. You write for a tired developer\nwho just woke up.")).toBe(true);
    for (const line of [
      "5. For confidence \"possible\", start the action with \"Confirm\".",
      "6. line1Actions: the two highest-priority actions, each max 60 characters, lowercase start.",
      "7. line2Tail: max 60 characters, reassuring, no numbers.",
      "9. Output JSON matching the schema. No markdown. No extra keys.",
      "Note: line 1 only lists the definite/likely action. The possible item stays in the checklist.",
    ]) expect(SYSTEM).toContain(line);
  });

  it.each([
    ["~\\code\\rail\\.env", "rail\\.env"],
    ["~\\code\\ai\\.venv\\Lib\\site-packages", "ai\\.venv\\Lib\\site-packages"],
    ["~\\AppData\\Local\\Programs\\Python\\Python314\\Lib\\site-packages", "Python314\\Lib\\site-packages"],
    ["certifi:~\\AppData\\Roaming\\Python\\Python314\\site-packages", "certifi:Python\\Python314\\site-packages"],
    ["C:\\Program Files\\Plex\\Plex Media Server.exe", "Program Files\\Plex\\Plex Media Server.exe"],
    ["node --version", "node --version"],
    ["~\\code\\rail\\Dockerfile:3", "rail\\Dockerfile:3"],
  ])("relativeLocation(%s)", (loc, expected) => expect(relativeLocation(loc, ROOTS)).toBe(expected));

  it("the model sees only the SPEC 6 fields, no home paths, no evidence details", () => {
    const findings = kitchenFindings();
    const railway = findings.find((f) => f.advisoryId === "railway-2026-10-21")!;
    const mf = modelFinding(railway, pack.advisories.find((a) => a.id === railway.advisoryId)!, ROOTS);
    expect(Object.keys(mf).sort()).toEqual(["action", "advisoryId", "allowedTokens", "confidence", "evidence", "id", "kev", "severity", "suggestedWhy", "summary", "title", "vendor"]);
    expect(mf.evidence).toEqual([{ location: "rail\\railway.toml" }, { location: "rail\\.env" }]);
    expect(mf.summary.length).toBeGreaterThan(140);
    expect(mf.suggestedWhy.length).toBeLessThanOrEqual(140);
  });

  it("states the exact counts the validator expects", () => {
    const findings = kitchenFindings();
    expect(expectedCounts(findings)).toEqual({ line1: 2, fyi: 1 });
    const user = buildUserPrompt(findings, pack, "2026-10-23", ROOTS);
    expect(user).toContain("- checklist: exactly 5 item(s)");
    expect(user).toContain("- line1Actions: exactly 2 item(s)");
    expect(user).toContain("- fyi: exactly 1 item(s).");
    const possibleOnly = findings.filter((f) => f.confidence === "possible");
    expect(expectedCounts(possibleOnly)).toEqual({ line1: 0, fyi: 0 });
  });

  it("the few-shot example uses made-up findings, not pack facts", () => {
    const example = SYSTEM.slice(SYSTEM.indexOf("Example."));
    expect(example).toContain("EXAMPLE-ID-1");
    expect(example).not.toMatch(/nodejs-2026|opencode-console|24\.22\.1|CVE-/);
  });

  it("user prompt follows SPEC 10.3 and never contains a home path", () => {
    const findings = kitchenFindings();
    const user = buildUserPrompt(findings, pack, "2026-10-23", ROOTS);
    expect(user.startsWith("DATE: 2026-10-23\nFINDINGS (ordered by priority, already verified):\n")).toBe(true);
    expect(user).toContain("FYI (awareness only, never actions):");
    expect(user).not.toMatch(/~[\\/]/);
    expect(user).not.toMatch(/[A-Za-z]:\\\\Users/);
    const json = JSON.parse(user.split("FINDINGS (ordered by priority, already verified):\n")[1]!.split("\n\nFYI")[0]!) as Array<{ id: string }>;
    expect(json.map((f) => f.id)).toEqual(findings.filter((f) => f.confidence !== "fyi").map((f) => f.id));
    const retry = buildUserPrompt(findings, pack, "2026-10-23", ROOTS, ["digits in line2Tail"]);
    expect(retry.endsWith("Your previous draft was rejected for:\n- digits in line2Tail\nFix every item and output the full JSON again.")).toBe(true);
  });
});
