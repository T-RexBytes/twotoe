import { describe, expect, it } from "vitest";
import type { KevEntry } from "../src/match/finding";
import { MATCHERS, matchAll } from "../src/match/matchAll";
import { compareFindings, priority } from "../src/match/priority";
import { belowFixed, cmpDotted, leadingVersion, lineStatus } from "../src/match/semverUtil";
import { extractRiskyTokens, tokenUnion } from "../src/match/tokens";
import { loadKevSnapshot, loadPack } from "../src/pack/loadPack";
import type { Inventory, InventoryItem } from "../src/schemas";
import { findingsFor, NOW } from "./matchHelpers";

const pack = loadPack();

function inv(items: InventoryItem[]): Inventory {
  return { scannedAt: "2026-10-23T01:30:00.000Z", roots: [], durationMs: 1, items, checksRun: items.length };
}

describe("semver helpers (SPEC 9.2)", () => {
  const node = { "22": "22.23.4", "24": "24.22.1", "26": "26.12.1" };
  const php = { "8.5": "8.5.12", "8.4": "8.4.27", "8.3": "8.3.36", "8.2": "8.2.35" };

  it("belowFixed", () => {
    expect(belowFixed("24.22.0", node)).toBe("vulnerable");
    expect(belowFixed("v24.22.1", node)).toBe("fixed");
    expect(belowFixed("8.3.35-cli", php)).toBe("vulnerable");
    expect(belowFixed("8.1.30", php)).toBe("unknownLine");
    expect(belowFixed("not a version", php)).toBe("unknownLine");
  });

  it("lineStatus places unknown lines", () => {
    expect(lineStatus("20.19.0", node)).toBe("belowLines");
    expect(lineStatus("25.1.0", node)).toBe("gap");
    expect(lineStatus("27.0.0", node)).toBe("aboveLines");
    expect(lineStatus("8.1.30", php)).toBe("belowLines");
    expect(lineStatus("8.6.0", php)).toBe("aboveLines");
    expect(lineStatus("18.10.2", { "18.11": "18.11.13", "19.0": "19.0.10" })).toBe("belowLines");
  });

  it("cmpDotted compares 4-part Plex versions as integers", () => {
    expect(cmpDotted("1.43.3.10860", "1.43.3.10861")).toBe(-1);
    expect(cmpDotted("1.43.3.10861", "1.43.3.10861")).toBe(0);
    expect(cmpDotted("1.43.10.1", "1.43.3.10861")).toBe(1);
    expect(cmpDotted("1.43", "1.43.0.0")).toBe(0);
  });

  it("leadingVersion", () => {
    expect(leadingVersion("24.22.0-alpine")).toEqual({ version: "24.22.0", parts: 3 });
    expect(leadingVersion("24-alpine")).toEqual({ version: "24", parts: 1 });
    expect(leadingVersion("v1.107.0")).toEqual({ version: "1.107.0", parts: 3 });
    expect(leadingVersion("1.43.3.10861-abc123")).toEqual({ version: "1.43.3.10861", parts: 4 });
    expect(leadingVersion("latest")).toBeNull();
  });
});

describe("priority (SPEC 7.4)", () => {
  it("follows the formula", () => {
    expect(priority({ severity: "critical", kev: false, kevDueDate: null, confidence: "likely", now: NOW })).toBe(85);
    expect(priority({ severity: "high", kev: false, kevDueDate: null, confidence: "definite", now: NOW })).toBe(170);
    expect(priority({ severity: "critical", kev: true, kevDueDate: "2026-11-03", confidence: "definite", now: NOW })).toBe(20);
    expect(priority({ severity: "critical", kev: true, kevDueDate: "2026-10-23", confidence: "definite", now: NOW })).toBe(-5);
    expect(priority({ severity: "info", kev: false, kevDueDate: null, confidence: "fyi", now: NOW })).toBe(1400);
  });

  it("breaks ties with credential exposure first", () => {
    const a = { priority: 100, advisoryId: "php2shell-2026", id: "a" };
    const b = { priority: 100, advisoryId: "railway-2026-10-21", id: "z" };
    expect([a, b].sort(compareFindings)[0]).toBe(b);
  });
});

describe("matchAll", () => {
  it("has exactly one matcher per pack advisory", () => {
    expect(Object.keys(MATCHERS).sort()).toEqual(pack.advisories.map((a) => a.id).sort());
  });

  it("orders the kitchen sink (f01 + f06 + f10 + f17)", async () => {
    const findings = await findingsFor({
      "app/.venv/Lib/site-packages/litellm-1.107.0.dist-info/METADATA": "x",
      "rail/.env": "RAILWAY_TOKEN=x\n",
      "rail/railway.toml": "",
    }, { nodeVersion: "24.22.0", plexVersion: "1.43.3.10860" });
    expect(findings.map((f) => `${f.advisoryId} ${f.confidence} ${f.priority}`)).toEqual([
      "plex2shell-2026 definite -5",
      "litellm-1.107.0 definite 70",
      "railway-2026-10-21 likely 85",
      "nodejs-2026-10-21 definite 170",
    ]);
  });

  it("merges three venvs with litellm 1.107.0 into one finding with three evidence rows", async () => {
    const files: Record<string, string> = {};
    for (const p of ["a", "b", "c"]) files[`${p}/.venv/Lib/site-packages/litellm-1.107.0.dist-info/METADATA`] = "x";
    const findings = await findingsFor(files);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.evidence).toHaveLength(3);
  });

  it("folds pins and sitecustomize next to cook files into the compromise finding", async () => {
    const findings = await findingsFor({
      "a/.venv/Lib/site-packages/cook.py": "x",
      "a/.venv/Lib/site-packages/sitecustomize.py": "x",
      "a/.venv/Lib/site-packages/litellm-1.107.0.dist-info/METADATA": "x",
      "a/requirements.txt": "litellm==1.107.0\n",
      "b/.venv/Lib/site-packages/sitecustomize.py": "x",
    });
    expect(findings.map((f) => `${f.vars?.variant} ${f.confidence} ${f.evidence.length}`)).toEqual([
      "compromise definite 4",
      "sitecustomize possible 1",
    ]);
  });

  it("dedupes the same finding and keeps ids stable", async () => {
    const files = { "a/.venv/Lib/site-packages/litellm-1.107.0.dist-info/METADATA": "x" };
    const one = await findingsFor(files);
    const two = await findingsFor(files);
    expect(one[0]!.id).toMatch(/^litellm-1\.107\.0:[0-9a-f]{8}$/);
    expect(one[0]!.id.split(":")[0]).toBe(two[0]!.id.split(":")[0]);
  });

  it("node: end-of-life lines, exact pins, and build-arg tags", async () => {
    const node20 = (await findingsFor({}, { nodeVersion: "20.19.0" }))[0]!;
    expect([node20.confidence, node20.vars?.variant, node20.vars?.fixed]).toEqual(["likely", "unsupported", "24.22.1"]);
    const pin = (await findingsFor({ "app/.nvmrc": "24.21.0\n" }))[0]!;
    expect([pin.confidence, pin.vars?.found]).toEqual(["likely", "24.21.0"]);
    expect(await findingsFor({ "app/.nvmrc": "24\n" })).toEqual([]);
    const arg = (await findingsFor({ "app/Dockerfile": "ARG V=24.22.0\nFROM node:${V}\n" }))[0]!;
    expect([arg.confidence, arg.vars?.variant]).toEqual(["possible", "confirmImage"]);
    const exact = (await findingsFor({ "app/Dockerfile": "FROM node:24.22.0-alpine\n" }))[0]!;
    expect([exact.confidence, exact.vars?.found]).toEqual(["definite", "24.22.0"]);
    const old = (await findingsFor({ "app/Dockerfile": "FROM node:20-alpine\n" }))[0]!;
    expect([old.confidence, old.vars?.variant, old.vars?.found]).toEqual(["likely", "unsupported", "20"]);
  });

  it("merges node --version and an exact .nvmrc pin into one upgrade finding", async () => {
    const findings = await findingsFor({ "app/.nvmrc": "24.22.0\n" }, { nodeVersion: "24.22.0" });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.confidence).toBe("definite");
    expect(findings[0]!.evidence.map((e) => e.detector).sort()).toEqual(["nvmrc", "runtimeVersion"]);
  });

  it("php docker tags", async () => {
    const f = (await findingsFor({ "app/docker-compose.yml": "services:\n  web:\n    image: php:8.3-apache\n" }))[0]!;
    expect([f.confidence, f.vars?.variant]).toEqual(["likely", "floating"]);
    const off = (await findingsFor({ "app/Dockerfile": "FROM php:7.4-fpm\n" }))[0]!;
    expect([off.confidence, off.vars?.variant]).toEqual(["definite", "offline"]);
  });

  it("gitlab image tags against both advisories", async () => {
    const ids = (tag: string) => findingsFor({ "g/docker-compose.yml": `services:\n  gl:\n    image: gitlab/gitlab-ce:${tag}\n` })
      .then((fs) => fs.map((f) => `${f.advisoryId} ${f.confidence} ${f.vars?.fixed ?? f.vars?.variant}`).sort());
    expect(await ids("19.4.1-ce.0")).toEqual(["gitlab-cve-2026-110264 definite 19.4.3", "gitlab-cve-2026-97229 definite 19.4.2"]);
    expect(await ids("19.4.2-ce.0")).toEqual(["gitlab-cve-2026-110264 definite 19.4.3"]);
    expect(await ids("19.5.1-ce.0")).toEqual([]);
    expect(await ids("17.2.0-ce.0")).toEqual(["gitlab-cve-2026-110264 definite 18.11.13"]);
    expect(await ids("latest")).toEqual(["gitlab-cve-2026-110264 possible confirmImage", "gitlab-cve-2026-97229 possible confirmImage"]);
  });

  it("plex docker: old version tag definite, latest possible", async () => {
    const tagged = (await findingsFor({}, { dockerImages: [{ repo: "plexinc/pms-docker", tag: "1.43.2.10000-abc" }] }))[0]!;
    expect(tagged.confidence).toBe("definite");
    const latest = (await findingsFor({}, { dockerImages: [{ repo: "plexinc/pms-docker", tag: "latest" }] }))[0]!;
    expect([latest.confidence, latest.vars?.variant]).toEqual(["possible", "confirmImage"]);
  });

  it("emudhra: OS store alone is possible, Disallowed means blocked", async () => {
    const subject = "emSign ECC Root CA - G3";
    const os = await findingsFor({}, { trustStores: { [subject]: [{ store: "windows:LocalMachine\\Root", present: true }] } });
    expect(os.map((f) => [f.confidence, f.vars?.variant])).toEqual([["possible", "confirmOs"]]);
    expect(await findingsFor({}, { trustStores: { [subject]: [{ store: "windows:LocalMachine\\Disallowed", present: true }] } })).toEqual([]);
    const both = await findingsFor({}, { trustStores: { [subject]: [{ store: "git-for-windows", present: true }, { store: "node", present: false }] } });
    expect(both.map((f) => f.vars?.variant)).toEqual(["git"]);
  });

  it("railway: one signal alone is possible", async () => {
    const f = (await findingsFor({ "a/railway.json": "{}" }))[0]!;
    expect([f.confidence, f.vars?.variant]).toEqual(["possible", "confirm"]);
  });

  it("sbi only for region IN", async () => {
    expect(await findingsFor({}, {}, "US")).toEqual([]);
    expect((await findingsFor({}, {}, "in"))[0]!.advisoryId).toBe("sbi-2026-10-21");
  });

  it("allowedTokens carry CVEs, vendor, fixed and found versions, summary numbers, evidence basenames", async () => {
    const f = (await findingsFor({}, { plexVersion: "1.43.3.10860" }))[0]!;
    const t = new Set(f.allowedTokens.map((x) => x.toLowerCase()));
    for (const tok of ["CVE-2026-96652", "Plex", "1.43.3.10861", "1.43.3.10860", "10860", "Plex Media Server", "2026-10-23", "23"]) {
      expect(t.has(tok.toLowerCase())).toBe(true);
    }
    expect(t.has("24.22.1")).toBe(false);
  });
});

describe("kev-recent", () => {
  const base: KevEntry = { cveID: "CVE-2026-1", vendorProject: "Undici", product: "Undici", dateAdded: "2026-10-20", dueDate: "2026-11-10" };
  const npm = inv([{ kind: "package", ecosystem: "npm", name: "undici", version: "7.1.0", source: "lockfile:x" }]);

  it("exact product match in the window is likely", () => {
    const f = matchAll(npm, pack, { now: NOW, kev: [base] });
    expect(f.map((x) => [x.advisoryId, x.confidence, x.vars?.fixed])).toEqual([["kev-recent", "likely", "2026-11-10"]]);
  });

  it("vendor-only match is possible; old or covered entries are skipped", () => {
    expect(matchAll(npm, pack, { now: NOW, kev: [{ ...base, product: "Something Else" }] })[0]!.confidence).toBe("possible");
    expect(matchAll(npm, pack, { now: NOW, kev: [{ ...base, dateAdded: "2026-09-01" }] })).toEqual([]);
    const plex = inv([{ kind: "app", name: "plex", version: "1.43.3.10861", source: "x" }]);
    expect(matchAll(plex, pack, { now: NOW, kev: [{ ...base, cveID: "CVE-2026-96652", vendorProject: "Plex", product: "Plex" }] })).toEqual([]);
  });

  it("the bundled snapshot loads (empty until refreshKev)", () => {
    expect(loadKevSnapshot()).toEqual([]);
  });
});

describe("risky tokens (shared with the validator)", () => {
  it("extracts CVEs, versions, numbers and known vendors", () => {
    expect(extractRiskyTokens("Upgrade Node from 24.22.0 to 24.22.1 (CVE-2026-111497) on PHP").sort())
      .toEqual(["111497", "2026", "22", "24", "24.22.0", "24.22.1", "CVE-2026-111497", "Node", "PHP"].sort());
  });

  it("tokenUnion keeps strings and their tokens once", () => {
    expect(tokenUnion(["Plex", "plex", "1.43.3.10861"])).toEqual(["Plex", "1.43.3.10861", "43", "10861"]);
  });
});
