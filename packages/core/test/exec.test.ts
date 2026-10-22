import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { runFile, whichAll } from "../src/util/exec";

const PRINT = "console.log(JSON.stringify({ hasNodeOptions: 'NODE_OPTIONS' in process.env, extra: process.env.TWOTOE_X ?? null, cwd: process.cwd() }))";

describe("runFile", () => {
  let setByTest = false;
  afterEach(() => {
    if (setByTest) delete process.env.NODE_OPTIONS;
    setByTest = false;
  });

  it("never passes TwoToe's environment (NODE_OPTIONS) to a child, and runs from an empty dir", async () => {
    if (!("NODE_OPTIONS" in process.env)) {
      process.env.NODE_OPTIONS = "--max-old-space-size=512";
      setByTest = true;
    }
    const r = await runFile(process.execPath, ["-e", PRINT], { env: { TWOTOE_X: "only-this" } });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout) as { hasNodeOptions: boolean; extra: string; cwd: string };
    expect(out.hasNodeOptions).toBe(false);
    expect(out.extra).toBe("only-this");
    expect(fs.readdirSync(out.cwd)).toEqual([]);
  });

  it("times out instead of hanging", async () => {
    const r = await runFile(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 300 });
    expect(r.ok).toBe(false);
    expect(r.timedOut).toBe(true);
  });

  it("returns ok=false for a missing executable without throwing", async () => {
    const r = await runFile("Z:\\definitely\\missing.exe", []);
    expect(r.ok).toBe(false);
  });

  it("does not run a shell", async () => {
    const r = await runFile(process.execPath, ["-e", "console.log(process.argv[1])", "a && echo pwned"]);
    expect(r.stdout.trim()).toBe("a && echo pwned");
  });
});

describe("whichAll", () => {
  it("finds node and rejects odd command names", async () => {
    expect((await whichAll("node")).length).toBeGreaterThan(0);
    expect(await whichAll("node & calc")).toEqual([]);
  });
});
