import { describe, expect, it } from "vitest";
import { Brief, loadPack, matchAll, type Finding, type Inventory, type InventoryItem } from "@twotoe/core";
import { assembleLines, buildBrief } from "../src/assemble";
import { evidenceSummary } from "../src/evidence";
import { fill, templateActions, templateDraft, truncateWords } from "../src/template";

const pack = loadPack();
const NOW = new Date("2026-10-23T07:00:00+05:30");
const adv = (id: string) => pack.advisories.find((a) => a.id === id)!;

function inv(items: InventoryItem[], checksRun = 412): Inventory {
  return { scannedAt: "2026-10-23T01:30:00.000Z", roots: ["~\\code"], durationMs: 1, items, checksRun };
}

const KITCHEN: InventoryItem[] = [
  { kind: "runtime", name: "node", version: "24.22.0", source: "node --version" },
  { kind: "app", name: "plex", version: "1.43.3.10860", source: "Plex Media Server" },
  { kind: "package", ecosystem: "pypi", name: "litellm", version: "1.107.0", source: "site-packages:~\\code\\ai\\.venv\\Lib\\site-packages" },
  { kind: "envKey", key: "RAILWAY_TOKEN", file: "~\\code\\rail\\.env" },
  { kind: "marker", marker: "railway.toml", path: "~\\code\\rail\\railway.toml" },
  { kind: "marker", marker: "cli:opencode", path: "PATH" },
];

describe("helpers", () => {
  it("truncateWords cuts at a word boundary within the cap", () => {
    expect(truncateWords("short", 10)).toBe("short");
    const t = truncateWords("one two three four five six seven", 20);
    expect(t.length).toBeLessThanOrEqual(20);
    expect(t).toBe("one two three...");
  });

  it("fill substitutes found and fixed", () => {
    expect(fill("Upgrade Node from {found} to {fixed}", { found: "24.22.0", fixed: "24.22.1" })).toBe("Upgrade Node from 24.22.0 to 24.22.1");
  });
});

describe("templateActions", () => {
  const findings = matchAll(inv(KITCHEN), pack, { now: NOW });
  const by = (id: string) => findings.find((f) => f.advisoryId === id)!;

  it("uses the advisory action and shortAction with values", () => {
    expect(templateActions(by("nodejs-2026-10-21"), adv("nodejs-2026-10-21")))
      .toEqual({ action: "Upgrade Node from 24.22.0 to 24.22.1", shortAction: "bump Node to 24.22.1" });
    expect(templateActions(by("plex2shell-2026"), adv("plex2shell-2026")).action)
      .toBe("Update Plex Media Server from 1.43.3.10860 to 1.43.3.10861 or newer");
  });

  it("uses variant wording (PHP 8.1 offline, litellm compromise)", () => {
    const php = matchAll(inv([{ kind: "runtime", name: "php", version: "8.1.30", source: "php -v" }]), pack, { now: NOW })[0]!;
    expect(templateActions(php, adv("php2shell-2026")).action).toBe("Take PHP 8.1.30 offline or move to 8.2.35; 8.1 and older get no fixes");
    const ioc = matchAll(inv([{ kind: "iocFile", filename: "cook.pth", dir: "~\\x\\site-packages", size: 10, sha256: "0".repeat(64) }]), pack, { now: NOW })[0]!;
    expect(templateActions(ioc, adv("litellm-1.107.0")).action).toBe("Treat this environment as compromised: delete it, rotate keys it could read");
  });

  it("builds eMudhra actions from the stores that need updating", () => {
    const f = matchAll(inv([
      { kind: "trustAnchor", store: "git-for-windows", subject: "emSign ECC Root CA - G3", present: true },
      { kind: "trustAnchor", store: "certifi:~\\py", subject: "emSign ECC Root CA - G3", present: true },
    ]), pack, { now: NOW })[0]!;
    expect(templateActions(f, adv("emudhra-weak-ca-keys"))).toEqual({
      action: "Update certifi and Git for Windows",
      shortAction: "update certifi and Git for Windows",
    });
  });

  it("starts every possible action with Confirm", () => {
    for (const f of findings.filter((x) => x.confidence === "possible")) {
      expect(templateActions(f, adv(f.advisoryId)).action).toMatch(/^Confirm /);
    }
  });
});

describe("templateDraft + assembleLines (SPEC 10.6, 10.7)", () => {
  it("kitchen sink: two actions inline, +2 more, checklist in priority order", () => {
    const findings = matchAll(inv(KITCHEN), pack, { now: NOW });
    const draft = templateDraft(findings, pack);
    expect(draft.line1Actions).toEqual(["update Plex to 1.43.3.10861", "rebuild your litellm env on 1.106.2"]);
    expect(draft.checklist.map((c) => c.findingId.split(":")[0])).toEqual([
      "plex2shell-2026", "litellm-1.107.0", "railway-2026-10-21", "nodejs-2026-10-21", "opencode-console-2026-10-17",
    ]);
    for (const c of draft.checklist) {
      expect(c.action.length).toBeLessThanOrEqual(90);
      expect(c.why.length).toBeLessThanOrEqual(140);
    }
    const { line1, line2 } = assembleLines(draft, findings, { checksRun: 412, durationMs: 14_230, egress: [] });
    expect(line1).toBe("4 things need you today: update Plex to 1.43.3.10861; rebuild your litellm env on 1.106.2; +2 more in the checklist.");
    expect(line2).toBe("Everything else: you're fine. Checked 412 things in 14.2s, 0 secrets left this machine.");
  });

  it("singular and nothing", () => {
    const one = matchAll(inv([KITCHEN[0]!]), pack, { now: NOW });
    expect(assembleLines(templateDraft(one, pack), one, { checksRun: 5, durationMs: 900, egress: [] }).line1)
      .toBe("1 thing needs you today: bump Node to 24.22.1.");
    expect(assembleLines(templateDraft([], pack), [], { checksRun: 5, durationMs: 900, egress: [] }).line1)
      .toBe("Nothing needs you today.");
  });

  it("possible-only findings do not count toward line 1", () => {
    const f = matchAll(inv([KITCHEN[5]!]), pack, { now: NOW });
    const draft = templateDraft(f, pack);
    expect(draft.line1Actions).toEqual([]);
    expect(draft.checklist).toHaveLength(1);
    expect(assembleLines(draft, f, { checksRun: 1, durationMs: 1, egress: [] }).line1).toBe("Nothing needs you today.");
  });

  it("FYI goes to the FYI block, never the checklist", () => {
    const f = matchAll(inv([]), pack, { now: NOW, region: "IN" });
    const draft = templateDraft(f, pack);
    expect(draft.checklist).toEqual([]);
    expect(draft.fyi).toEqual(["SBI disclosed that records of 3,897 customers were found on the dark web; expect phishing, SBI never asks for OTP or PIN."]);
  });

  it("line 2 says what left the machine when anything did", () => {
    const egress = [{ host: "127.0.0.1", method: "POST", bytesOut: 900 }, { host: "www.cisa.gov", method: "GET", bytesOut: 0 }];
    expect(assembleLines(templateDraft([], pack), [], { checksRun: 1, durationMs: 1000, egress }).line2).toContain("0 secrets left this machine.");
    const leak = [...egress, { host: "o123.ingest.sentry.io", method: "POST", bytesOut: 2048 }];
    expect(assembleLines(templateDraft([], pack), [], { checksRun: 1, durationMs: 1000, egress: leak }).line2)
      .toContain("data went to o123.ingest.sentry.io (2048 bytes).");
  });

  it("keeps line 1 under 160 when actions are long", () => {
    const fake = (i: number): Finding => ({ id: `x:${i}`, advisoryId: "x", confidence: "definite", severity: "high", priority: i, evidence: [], allowedTokens: [] });
    const findings = [fake(1), fake(2), fake(3)];
    const draft = { line1Actions: ["a".repeat(60), "b".repeat(60)], line2Tail: "fine", checklist: [], fyi: [] };
    const { line1 } = assembleLines(draft, findings, { checksRun: 1, durationMs: 1, egress: [] });
    expect(line1.length).toBeLessThanOrEqual(160);
  });

  it("buildBrief passes the zod Brief contract", () => {
    const findings = matchAll(inv(KITCHEN), pack, { now: NOW, region: "IN" });
    const brief = buildBrief({ draft: templateDraft(findings, pack), findings, inventory: inv(KITCHEN), now: NOW, durationMs: 1234, mode: "template" });
    expect(Brief.safeParse(brief).success).toBe(true);
    expect(brief.date).toBe("2026-10-23");
    expect(brief.meta).toMatchObject({ mode: "template", model: null, attempts: 0, validatorRejections: [], egress: [] });
    expect(brief.fyi).toHaveLength(1);
  });
});

describe("evidenceSummary", () => {
  it("matches the SPEC 12 look", () => {
    const f = matchAll(inv(KITCHEN), pack, { now: NOW });
    const by = (id: string) => f.find((x) => x.advisoryId === id)!;
    expect(evidenceSummary(by("railway-2026-10-21"))).toBe("railway.toml, .env (RAILWAY_TOKEN)");
    expect(evidenceSummary(by("nodejs-2026-10-21"))).toBe("node --version");
    expect(evidenceSummary(by("litellm-1.107.0"))).toBe(".venv");
    expect(evidenceSummary(by("opencode-console-2026-10-17"))).toBe("opencode on PATH");
  });
});
