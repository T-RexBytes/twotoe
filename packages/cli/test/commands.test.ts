import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { loadPack } from "@twotoe/core";
import { runAsk } from "../src/commands/ask";
import { makeBrief, renderBrief } from "../src/commands/brief";
import { runChecks, renderChecks, type DoctorDeps } from "../src/commands/doctor";
import { evalArgs } from "../src/commands/evalCmd";
import { findFinding, renderExplain } from "../src/commands/explain";
import { renderPack, verifyPlaceholders } from "../src/commands/pack";
import { labelOf, plistFor } from "../src/launchd";
import { SPEAK_SCRIPT, speechText } from "../src/speak";
import { plans, type PlanContext } from "../src/taskScheduler";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const F22 = path.resolve(HERE, "..", "..", "..", "eval", "fixtures", "f22-kitchen-sink");
const CANARY = "TWOTOE_CANARY_9f3a";
// Local-time constructor: the header and brief date read the same in every timezone (CI runs UTC).
const NOW = new Date(2026, 9, 23, 7, 0, 0);

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

describe("e2e: twotoe brief --fixture f22-kitchen-sink --no-llm (SPEC 15)", () => {
  it("matches the snapshot", async () => {
    const res = await makeBrief([], { fixture: F22, llm: false, offline: true, now: NOW, userConfig: {} });
    const text = renderBrief(res, NOW, false).replace(/ in \d+(\.\d+)?s,/, " in <T>s,");
    expect(text).not.toContain(CANARY);
    expect(text).not.toMatch(/[A-Za-z]:\\|\/Users\/|\/home\//);
    expect(res.exitCode).toBe(10);
    expect(text).toMatchSnapshot();
  });
});

const baseDeps = (over: Partial<DoctorDeps> = {}): DoctorDeps => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "twotoe-doctor-"));
  dirs.push(dir);
  return {
    platform: "win32",
    nodeVersion: "v24.22.1",
    configPath: path.join(dir, "config.json"),
    executionPolicy: async () => "RemoteSigned",
    longPathsEnabled: async () => true,
    which: async () => ["C:\\x\\pnpm.cmd"],
    ollamaTags: async () => ["gemma4:e4b"],
    warm: async () => 1500,
    temporalUp: async () => true,
    temporalExe: async () => "C:\\x\\temporal.exe",
    scheduledTasks: async () => ["TwoToe-Worker"],
    cardBuilt: () => true,
    ...over,
  };
};

describe("twotoe doctor (SPEC 12)", () => {
  it("all good: no problems, model pre-warmed", async () => {
    const checks = await runChecks(baseDeps(), {});
    expect(checks.filter((c) => c.status === "problem")).toEqual([]);
    expect(checks.find((c) => c.name === "Model")?.detail).toBe("gemma4:e4b loaded in 1.5s");
  });

  it("flags an unpatched Node, Ollama down, and a broken config as problems, with fixes", async () => {
    const deps = baseDeps({ nodeVersion: "v24.22.0", ollamaTags: async () => null });
    fs.writeFileSync(deps.configPath, "{ not json");
    const checks = await runChecks(deps, {});
    const problems = checks.filter((c) => c.status === "problem").map((c) => c.name);
    expect(problems).toEqual(["Node", "Config", "Ollama"]);
    const text = renderChecks(checks, true, false);
    expect(text).toContain("Install Node 24.22.1 or newer");
    expect(text).toContain("https://ollama.com/download");
    expect(text).toContain("3 problem(s).");
  });

  it("a missing model is a problem with `ollama pull`; a cloud tag is refused", async () => {
    const missing = await runChecks(baseDeps({ ollamaTags: async () => ["qwen3:4b"] }), {});
    expect(missing.find((c) => c.name === "Model")).toMatchObject({ status: "problem", fix: "ollama pull gemma4:e4b" });
    const cloud = await runChecks(baseDeps(), { model: "gemma4:cloud" });
    expect(cloud.find((c) => c.name === "Model")).toMatchObject({ status: "problem" });
  });

  it("Temporal and scheduled tasks are warnings, never problems", async () => {
    const checks = await runChecks(baseDeps({ temporalUp: async () => false, temporalExe: async () => null, scheduledTasks: async () => [] }), { warm: false });
    expect(checks.find((c) => c.name === "Temporal")).toMatchObject({ status: "warn", fix: "winget install Temporal.TemporalCLI" });
    expect(checks.find((c) => c.name === "Nightly run")?.status).toBe("warn");
    expect(checks.some((c) => c.status === "problem")).toBe(false);
  });

  it("restricted execution policy and long paths off are warnings with fixes", async () => {
    const checks = await runChecks(baseDeps({ executionPolicy: async () => "Restricted", longPathsEnabled: async () => false }), { warm: false });
    expect(checks.find((c) => c.name === "Execution policy")).toMatchObject({ status: "warn", fix: "Set-ExecutionPolicy -Scope CurrentUser RemoteSigned" });
    expect(checks.find((c) => c.name === "Long paths")?.fix).toContain("core.longpaths true");
  });
});

describe("twotoe explain (SPEC 12)", () => {
  it("finds by exact id or unique prefix, lists ids otherwise, and shows evidence and sources", async () => {
    const res = await makeBrief([], { fixture: F22, llm: false, offline: true, now: NOW, userConfig: {} });
    const plex = findFinding(res.findings, "plex");
    expect(plex.kind).toBe("found");
    if (plex.kind !== "found") return;
    expect(findFinding(res.findings, plex.finding.id).kind).toBe("found");
    const miss = findFinding(res.findings, "nope");
    expect(miss).toMatchObject({ kind: "missing" });
    expect(miss.kind === "missing" && miss.ids.length).toBe(4);
    const advisory = loadPack().advisories.find((a) => a.id === plex.finding.advisoryId);
    const text = renderExplain(plex.finding, advisory, res.brief, false);
    expect(text).toContain("CVE-2026-96652");
    expect(text).toContain("https://forums.plex.tv/");
    expect(text).toContain("appVersion");
    expect(text).not.toContain(CANARY);
  });

  it("a shared prefix is ambiguous", () => {
    const f = (id: string) => ({ id, advisoryId: "x", confidence: "definite" as const, severity: "high" as const, priority: 1, evidence: [], allowedTokens: [] });
    expect(findFinding([f("gitlab-cve-2026-110264:a"), f("gitlab-cve-2026-97229:b")], "gitlab")).toMatchObject({ kind: "ambiguous" });
  });
});

describe("twotoe pack (SPEC 12)", () => {
  it("lists every advisory with its verifiedAt and the open VERIFY values", () => {
    const pack = loadPack();
    const text = renderPack(pack, null, null, 0);
    for (const a of pack.advisories) expect(text).toContain(a.id);
    expect(text).toContain(`advisory pack ${pack.packVersion}`);
    expect(text).toContain("Run `twotoe pack --refresh`");
    expect(verifyPlaceholders({ a: { b: "VERIFY", c: ["x", "VERIFY"] } }, "id")).toEqual(["id.a.b", "id.a.c[1]"]);
  });

  it("reports a failed refresh honestly", () => {
    const text = renderPack(loadPack(), null, { entries: [], source: "bundled", catalogVersion: null }, 0);
    expect(text).toContain("refresh failed, using the bundled snapshot");
  });
});

describe("twotoe eval (SPEC 12)", () => {
  it("passes models, runs and fixture prefixes through as an argument array", () => {
    expect(evalArgs({ models: "gemma4:e4b,qwen3:4b", runs: "5", only: "f22,f06" })).toEqual(["--models", "gemma4:e4b,qwen3:4b", "--runs", "5", "--only", "f22,f06"]);
    expect(evalArgs({ llm: false, models: "gemma4:e4b" })).toEqual(["--no-llm"]);
  });

  it("rejects values that are not model tags or numbers", () => {
    expect(() => evalArgs({ models: "gemma4; rm" })).toThrow("--models");
    expect(() => evalArgs({ runs: "0" })).toThrow("--runs");
    expect(() => evalArgs({ only: "../x" })).toThrow("--only");
  });
});

describe("twotoe sleep --launchd (SPEC 11.3, macOS)", () => {
  const ctx: PlanContext = {
    node: "/usr/local/bin/node", repo: "/Users/alice/twotoe", cliEntry: "/Users/alice/twotoe/packages/cli/src/index.ts",
    temporalExe: "/opt/homebrew/bin/temporal", stateDir: "/Users/alice/.twotoe", at: "03:00",
  };

  it("log-on tasks become RunAtLoad agents with the same arguments", () => {
    const [server, worker] = plans("temporal", ctx);
    expect(labelOf(server!)).toBe("tech.twotoe.temporal-server");
    expect(labelOf(worker!)).toBe("tech.twotoe.worker");
    const plist = plistFor(server!);
    expect(plist).toContain("<key>RunAtLoad</key><true/>");
    expect(plist).toContain("<string>127.0.0.1</string>");
    expect(plist).toContain(`<key>StandardErrorPath</key><string>${path.join(ctx.stateDir, "logs", "TwoToe-TemporalServer.err.log")}</string>`);
  });

  it("--no-temporal becomes one daily StartCalendarInterval agent; strings are XML-escaped", () => {
    const [nightly] = plans("no-temporal", { ...ctx, at: "02:30", repo: "/Users/a&b/twotoe" });
    const plist = plistFor(nightly!);
    expect(plist).toContain("<key>Hour</key><integer>2</integer><key>Minute</key><integer>30</integer>");
    expect(plist).toContain("/Users/a&amp;b/twotoe");
    expect(plist).not.toContain("RunAtLoad");
  });
});

describe("twotoe ask (SPEC 12, story 10)", () => {
  it("answers from the fixture's findings through the validator and prints the cited ids", async () => {
    const res = await makeBrief([], { fixture: F22, llm: false, offline: true, now: NOW, userConfig: {} });
    const node = res.findings.find((f) => f.advisoryId === "nodejs-2026-10-21")!;
    const client = { chat: async () => ({ content: JSON.stringify({ answer: "Node 24.22.0 lacks the Oct 21 fixes; upgrade to 24.22.1.", findingIds: [node.id] }), wallMs: 1 }) };
    let out = "";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(((s: string) => { out += s; return true; }) as typeof process.stdout.write);
    try {
      expect(await runAsk("why does the Node one matter?", { fixture: F22, client, model: "gemma4:e4b" })).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(out).toContain("upgrade to 24.22.1");
    expect(out).toContain(`based on: ${node.id}`);
    expect(out).toContain("validator: passed");
    expect(out).not.toContain(CANARY);
  });

  it("an empty question is refused", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as typeof process.stdout.write);
    try {
      expect(await runAsk("  ", { fixture: F22 })).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("twotoe brief --speak (SPEC 11.8, local voice)", () => {
  it("the script is constant: the text travels in TWOTOE_TEXT, never inside the script", () => {
    expect(SPEAK_SCRIPT).toContain("$env:TWOTOE_TEXT");
    expect(SPEAK_SCRIPT).not.toMatch(/http|elevenlabs/i);
    expect(speechText("Nothing needs you today.", "Everything else:  you're fine.")).toBe("Nothing needs you today. Everything else: you're fine.");
  });
});
