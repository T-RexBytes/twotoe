import { matchAll, type InventoryItem } from "@twotoe/core";
import { describe, expect, it } from "vitest";
import { templateDraft } from "../src/template";
import { validate, validateDetailed } from "../src/validate";
import { goodDraft, inv, kevOf, kitchenFindings, NOW, pack } from "./fixtures";

const findings = kitchenFindings();
const id = (adv: string) => findings.find((f) => f.advisoryId === adv)!.id;
const reasons = (d: ReturnType<typeof goodDraft>) => validate(d, findings, kevOf);

describe("grounding validator (SPEC 10.5)", () => {
  it("accepts the template draft", () => {
    expect(reasons(goodDraft(findings))).toEqual([]);
  });

  it("rejects an unknown findingId", () => {
    const d = goodDraft(findings);
    d.checklist[0]!.findingId = "nodejs-2026-10-21:a1";
    expect(reasons(d)).toContain("unknown findingId nodejs-2026-10-21:a1");
  });

  it("rejects a duplicate findingId", () => {
    const d = goodDraft(findings);
    d.checklist[1] = { ...d.checklist[0]! };
    const r = reasons(d);
    expect(r).toContain(`duplicate findingId ${d.checklist[0]!.findingId}`);
    expect(r).toContain(`missing finding ${id("litellm-1.107.0")}`);
  });

  it("rejects an invented CVE", () => {
    const d = goodDraft(findings);
    const node = d.checklist.find((c) => c.findingId === id("nodejs-2026-10-21"))!;
    node.why = "Fixes CVE-2026-999999 in the Brotli decoder.";
    expect(reasons(d)).toContain(`ungrounded token "CVE-2026-999999" in ${node.findingId}`);
  });

  it("rejects an invented version, and a version borrowed from another finding", () => {
    const d = goodDraft(findings);
    const node = d.checklist.find((c) => c.findingId === id("nodejs-2026-10-21"))!;
    node.action = "Upgrade Node from 24.22.0 to 24.23.0";
    const plex = d.checklist.find((c) => c.findingId === id("plex2shell-2026"))!;
    plex.why = "Plex before 1.43.3.10861 needs Node 24.22.1.";
    const r = reasons(d);
    expect(r).toContain(`ungrounded token "24.23.0" in ${node.findingId}`);
    expect(r).toContain(`ungrounded token "24.22.1" in ${plex.findingId}`);
    expect(r).toContain(`ungrounded token "Node" in ${plex.findingId}`);
  });

  it("allows the advisory's disclosure date (the SPEC 10.4 'Oct 21' example)", () => {
    const d = goodDraft(findings);
    d.checklist.find((c) => c.findingId === id("nodejs-2026-10-21"))!.why = "The Oct 21 Node release fixes a Brotli decoder bug and a TLS hostname check bypass.";
    expect(reasons(d)).toEqual([]);
  });

  it("gates hype words by severity and KEV", () => {
    const d = goodDraft(findings);
    d.checklist.find((c) => c.findingId === id("plex2shell-2026"))!.why = "Critical: these flaws are actively exploited.";   // critical + KEV: ok
    d.checklist.find((c) => c.findingId === id("railway-2026-10-21"))!.why = "A critical credential exposure.";             // critical, not KEV: ok
    const node = d.checklist.find((c) => c.findingId === id("nodejs-2026-10-21"))!;
    node.why = "An urgent, critical bug that is actively exploited.";                                                          // high, not KEV
    const r = reasons(d);
    expect(r.filter((x) => x.startsWith("hype word"))).toEqual([
      `hype word "critical" not allowed in ${node.findingId}`,
      `hype word "urgent" not allowed in ${node.findingId}`,
      `hype word "actively" not allowed in ${node.findingId}`,
      `hype word "exploited" not allowed in ${node.findingId}`,
    ]);
  });

  it("requires possible actions to start with Confirm", () => {
    const d = goodDraft(findings);
    const oc = d.checklist.find((c) => c.findingId === id("opencode-console-2026-10-17"))!;
    oc.action = "Revoke your OpenCode Console keys";
    expect(reasons(d)).toContain(`possible finding ${oc.findingId} must start with "Confirm"`);
  });

  it("rejects digits and specifics in line2Tail", () => {
    const d = goodDraft(findings);
    d.line2Tail = "all 412 other checks passed";
    expect(reasons(d)).toContain("digits in line2Tail");
    d.line2Tail = "Plex is fine now";
    expect(reasons(d)).toContain('line2Tail mentions "Plex"');
  });

  it("checks coverage: every non-FYI finding exactly once", () => {
    const d = goodDraft(findings);
    const dropped = d.checklist.pop()!;
    expect(reasons(d)).toContain(`missing finding ${dropped.findingId}`);
  });

  it("rejects an FYI finding in the checklist", () => {
    const d = goodDraft(findings);
    const sbi = findings.find((f) => f.confidence === "fyi")!;
    d.checklist.push({ findingId: sbi.id, action: "Expect phishing", why: "SBI data exposure." });
    expect(reasons(d)).toContain(`FYI finding ${sbi.id} placed in the checklist`);
  });

  it("checks line1Actions count and grounding against the top two actionable findings", () => {
    const d = goodDraft(findings);
    d.line1Actions = ["update Plex to 1.43.3.10861"];
    expect(reasons(d)).toContain("line1Actions has 1 item(s), expected 2");
    d.line1Actions = ["update Plex to 1.43.3.10861", "bump Node to 24.22.1"];   // Node is 4th, not top 2
    expect(reasons(d)).toContain('ungrounded token "24.22.1" in line1Actions');
  });

  it("checks length caps after trimming", () => {
    const d = goodDraft(findings);
    const node = d.checklist.find((c) => c.findingId === id("nodejs-2026-10-21"))!;
    node.action = `Upgrade Node from 24.22.0 to 24.22.1 ${"now ".repeat(20)}`;
    node.why = "w".repeat(141);
    const r = reasons(d);
    expect(r).toContain(`action over 90 characters in ${node.findingId}`);
    expect(r).toContain(`why over 140 characters in ${node.findingId}`);
  });

  it("checks FYI lines: count and grounding", () => {
    const d = goodDraft(findings);
    d.fyi = ["SBI disclosed 4,000 records; expect phishing."];
    expect(reasons(d)).toContain('ungrounded token "000" in fyi');
    d.fyi = [];
    expect(reasons(d)).toContain("fyi has 0 line(s), expected 1");
  });

  it("marks only the failing items as bad (for the partial fallback)", () => {
    const d = goodDraft(findings);
    d.checklist.find((c) => c.findingId === id("nodejs-2026-10-21"))!.why = "Fixes CVE-2026-1.";
    const v = validateDetailed(d, findings, kevOf);
    expect([...v.badItems]).toEqual([id("nodejs-2026-10-21")]);
    expect([v.line1Bad, v.tailBad, v.fyiBad]).toEqual([false, false, false]);
  });
});

describe("template drafts always pass the validator", () => {
  const cases: Array<[string, InventoryItem[], string | null]> = [
    ["php 8.1 offline", [{ kind: "runtime", name: "php", version: "8.1.30", source: "php -v" }], null],
    ["node 20 end-of-life", [{ kind: "runtime", name: "node", version: "20.19.0", source: "node --version" }], null],
    ["litellm compromise + pin", [
      { kind: "iocFile", filename: "cook.pth", dir: "~\\code\\a\\.venv\\Lib\\site-packages", size: 9, sha256: "0".repeat(64) },
      { kind: "package", ecosystem: "pypi", name: "litellm", version: "1.107.0", source: "pin:~\\code\\a\\requirements.txt:1" },
    ], null],
    ["gitlab both advisories", [{ kind: "dockerImage", image: "gitlab/gitlab-ce", tag: "19.3.1-ce.0", source: "x" }], null],
    ["gitlab old line", [{ kind: "dockerImage", image: "gitlab/gitlab-ee", tag: "17.2.0-ee.0", source: "x" }], null],
    ["emudhra mixed", [
      { kind: "trustAnchor", store: "node", subject: "emSign ECC Root CA - G3", present: true },
      { kind: "trustAnchor", store: "windows:CurrentUser\\Root", subject: "emSign ECC Root CA - G3", present: true },
    ], null],
    ["plex docker latest", [{ kind: "dockerImage", image: "plexinc/pms-docker", tag: "latest", source: "docker images" }], null],
    ["railway confirm + sbi", [{ kind: "marker", marker: "cli:railway", path: "PATH" }], "IN"],
    ["php floating tag", [{ kind: "dockerImage", image: "php", tag: "8.3-apache", source: "~\\code\\Dockerfile:1" }], null],
  ];
  it.each(cases)("%s", (_name, items, region) => {
    const f = matchAll(inv(items), pack, { now: NOW, region });
    expect(f.length).toBeGreaterThan(0);
    expect(validate(templateDraft(f, pack), f, kevOf)).toEqual([]);
  });
});
