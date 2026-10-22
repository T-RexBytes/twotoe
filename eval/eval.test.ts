import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectInventory, FixtureProbe, loadConfig, loadPack, matchAll } from "@twotoe/core";
import { afterAll, describe, expect, it } from "vitest";
import { CANARY, generate } from "./gen-fixtures";
import { median, p90, reasonCategory } from "./lib";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp: string[] = [];
afterAll(() => { for (const d of tmp) fs.rmSync(d, { recursive: true, force: true }); });

describe("gen-fixtures", () => {
  it("writes 24 fixtures, each with probe.json, expected.json and a canary .env", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "twotoe-fx-"));
    tmp.push(root);
    const names = generate(root);
    expect(names).toHaveLength(24);
    expect(names[0]).toBe("f01-litellm-bad-venv");
    expect(names[23]).toBe("f24-clean-tricky");
    for (const n of names) {
      expect(fs.existsSync(path.join(root, n, "probe.json"))).toBe(true);
      expect(fs.readFileSync(path.join(root, n, "project", "app", ".env"), "utf8")).toContain(CANARY);
      const e = JSON.parse(fs.readFileSync(path.join(root, n, "expected.json"), "utf8")) as { fixture: string };
      expect(e.fixture).toBe(n);
    }
  });

  it("is deterministic and refuses to overwrite changed ground truth", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "twotoe-fx-"));
    tmp.push(root);
    generate(root);
    expect(() => generate(root)).not.toThrow();
    const p = path.join(root, "f10-node-old-24", "expected.json");
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("definite", "likely"));
    expect(() => generate(root)).toThrow(/refusing to overwrite ground truth/);
  });

  it("the committed fixtures match the generator (nobody hand-edited expected.json)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "twotoe-fx-"));
    tmp.push(root);
    for (const n of generate(root)) {
      expect(fs.readFileSync(path.join(HERE, "fixtures", n, "expected.json"), "utf8")).toBe(fs.readFileSync(path.join(root, n, "expected.json"), "utf8"));
    }
  });
});

describe("matcher against the committed ground truth", () => {
  const pack = loadPack();
  const NOW = new Date(2026, 9, 23, 7, 0);
  const dirs = fs.readdirSync(path.join(HERE, "fixtures")).filter((d) => /^f\d{2}-/.test(d)).sort();
  it.each(dirs)("%s", async (name) => {
    const dir = path.join(HERE, "fixtures", name);
    const expected = JSON.parse(fs.readFileSync(path.join(dir, "expected.json"), "utf8")) as { findings: Array<{ advisoryId: string; confidence: string }>; ordered?: boolean };
    const { inventory } = await collectInventory({ roots: [path.join(dir, "project")], probe: new FixtureProbe(path.join(dir, "probe.json")), home: dir, machinePython: false, now: () => NOW });
    const got = matchAll(inventory, pack, { region: loadConfig(path.join(dir, "config.json")).region ?? null, now: NOW })
      .map((f) => ({ advisoryId: f.advisoryId, confidence: f.confidence }));
    if (expected.ordered) expect(got).toEqual(expected.findings);
    else expect([...got].sort((a, b) => a.advisoryId.localeCompare(b.advisoryId))).toEqual([...expected.findings].sort((a, b) => a.advisoryId.localeCompare(b.advisoryId)));
    expect(JSON.stringify(inventory)).not.toContain(CANARY);
  });
});

describe("eval helpers", () => {
  it("categorizes validator reasons", () => {
    expect(reasonCategory('ungrounded token "24.23.0" in nodejs-2026-10-21:ab12cd34')).toBe("ungrounded token in checklist");
    expect(reasonCategory('ungrounded token "21" in line1Actions')).toBe("ungrounded token in line 1");
    expect(reasonCategory("why over 140 characters in railway-2026-10-21:1")).toBe("why over 140 chars");
    expect(reasonCategory("line1 action over 60 characters")).toBe("line-1 action over 60 chars");
    expect(reasonCategory("digits in line2Tail")).toBe("line-2 tail with numbers or names");
    expect(reasonCategory("output is not valid JSON")).toBe("invalid JSON");
    expect(reasonCategory("something new")).toBe("other");
  });

  it("computes median and p90", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});
