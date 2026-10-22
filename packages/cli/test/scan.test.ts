import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { runScan, selfNodeStatus } from "../src/commands/scan";

const CANARY = "TWOTOE_CANARY_9f3a";
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
afterEach(() => vi.restoreAllMocks());

describe("selfNodeStatus (SPEC 8.2.1 dogfood check)", () => {
  it.each([
    ["v24.22.0", false], ["v24.22.1", true], ["v24.23.0", true], ["v22.23.3", false],
    ["v26.12.1", true], ["v24.11.0", false],
  ])("%s patched=%s", (v, patched) => expect(selfNodeStatus(v).patched).toBe(patched));

  it("has no verdict for lines without a release", () => {
    expect(selfNodeStatus("v20.19.0")).toMatchObject({ patched: null, fixed: null });
  });
});

describe("twotoe scan --fixture --json", () => {
  it("prints a redacted inventory with no canary", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "twotoe-cli-"));
    dirs.push(dir);
    fs.mkdirSync(path.join(dir, "project", "app"), { recursive: true });
    fs.writeFileSync(path.join(dir, "project", "app", ".env"), `RAILWAY_TOKEN=${CANARY}\n`);
    fs.writeFileSync(path.join(dir, "project", "app", "railway.toml"), "");
    fs.writeFileSync(path.join(dir, "probe.json"), JSON.stringify({ nodeVersion: "24.22.0", commands: ["railway"] }));

    let out = "";
    vi.spyOn(process.stdout, "write").mockImplementation(((s: string) => { out += s; return true; }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, "write").mockImplementation((() => true) as typeof process.stderr.write);
    await runScan([], { json: true, fixture: dir });

    const parsed = JSON.parse(out) as { inventory: { items: Array<{ kind: string; key?: string; marker?: string }> } };
    expect(out).not.toContain(CANARY);
    expect(out.toLowerCase()).not.toContain(os.homedir().toLowerCase().replace(/\\/g, "\\\\"));
    expect(parsed.inventory.items.filter((i) => i.kind === "envKey").map((i) => i.key)).toEqual(["RAILWAY_TOKEN"]);
    expect(parsed.inventory.items.filter((i) => i.kind === "marker").map((i) => i.marker).sort()).toEqual(["cli:railway", "railway.toml"]);
  });
});
