import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import raw from "../src/pack/advisories.json";
import { loadPack } from "../src/pack/loadPack";
import { AdvisoryPack } from "../src/schemas";

const here = path.dirname(fileURLToPath(import.meta.url));
const verifyDoc = readFileSync(path.join(here, "..", "..", "..", "docs", "VERIFY.md"), "utf8");

// Ids from SPEC 7.2. The pack must carry exactly these for the MVP.
const SPEC_IDS = [
  "litellm-1.107.0",
  "railway-2026-10-21",
  "opencode-console-2026-10-17",
  "php2shell-2026",
  "nodejs-2026-10-21",
  "gitlab-cve-2026-110264",
  "gitlab-cve-2026-97229",
  "plex2shell-2026",
  "emudhra-weak-ca-keys",
  "sbi-2026-10-21",
  "kev-recent",
];

// Collects JSON paths whose string value is exactly "VERIFY".
function verifyPaths(value: unknown, at = ""): string[] {
  if (value === "VERIFY") return [at];
  if (Array.isArray(value)) return value.flatMap((v, i) => verifyPaths(v, `${at}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => verifyPaths(v, at ? `${at}.${k}` : k));
  }
  return [];
}

describe("bundled advisory pack", () => {
  const pack = loadPack();

  it("validates against the zod schema", () => {
    expect(AdvisoryPack.safeParse(raw).success).toBe(true);
  });

  it("contains exactly the SPEC 7.2 ids", () => {
    expect(pack.advisories.map((a) => a.id).sort()).toEqual([...SPEC_IDS].sort());
  });

  it("rejects duplicate ids", () => {
    const first = pack.advisories[0]!;
    expect(AdvisoryPack.safeParse({ ...pack, advisories: [first, first] }).success).toBe(false);
  });

  it.each(pack.advisories.map((a) => [a.id, a] as const))("%s has dated, checkable facts", (_id, a) => {
    expect(a.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(a.disclosedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    if (a.kevDueDate !== null) expect(a.kevDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const cve of a.cves) expect(cve).toMatch(/^CVE-\d{4}-\d{4,}$/);
    // Advisory actions feed checklist items, which are capped at 90 chars.
    expect(a.action.length).toBeLessThanOrEqual(90);
    expect(a.check.params.detectors).toContain(a.check.detector);
  });

  it("has no em dashes in user-facing text", () => {
    for (const a of pack.advisories) {
      expect(`${a.title} ${a.summary} ${a.action}`).not.toMatch(/—/);
    }
  });

  it("only marks KEV entries that carry a due date or are the KEV matcher", () => {
    for (const a of pack.advisories) {
      if (a.kev && a.id !== "kev-recent") expect(a.kevDueDate).not.toBeNull();
      if (!a.kev) expect(a.kevDueDate).toBeNull();
    }
  });

  it("lists every VERIFY placeholder in docs/VERIFY.md", () => {
    const open = pack.advisories.flatMap((a) =>
      verifyPaths(a).map((p) => `${a.id}.${p}`));
    for (const p of open) expect(verifyDoc).toContain(p);
  });
});
