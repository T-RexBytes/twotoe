import { describe, expect, it } from "vitest";
import type { Finding } from "../src/schemas";
import { CANARY } from "./helpers";
import { findingsFor } from "./matchHelpers";

// SPEC 9.3, one test per row. Every case runs the real pipeline: synthetic
// files + FixtureProbe -> collectInventory -> matchAll.

const SECRET = `SECRET_VALUE=${CANARY}\n`;

function only(findings: Finding[], advisoryId: string): Finding {
  const mine = findings.filter((f) => f.advisoryId === advisoryId);
  expect(mine).toHaveLength(1);
  return mine[0]!;
}

const VENV = "app/.venv/Lib/site-packages";

describe("SPEC 9.3 matcher truth table", () => {
  it("node 24.22.0 -> nodejs definite, upgrade to 24.22.1", async () => {
    const f = only(await findingsFor({}, { nodeVersion: "24.22.0" }), "nodejs-2026-10-21");
    expect(f.confidence).toBe("definite");
    expect(f.vars).toEqual({ found: "24.22.0", fixed: "24.22.1" });
  });

  it("node 24.22.1 -> none", async () => {
    expect(await findingsFor({}, { nodeVersion: "24.22.1" })).toEqual([]);
  });

  it("node 26.12.0 -> nodejs definite", async () => {
    const f = only(await findingsFor({}, { nodeVersion: "26.12.0" }), "nodejs-2026-10-21");
    expect(f.confidence).toBe("definite");
    expect(f.vars?.fixed).toBe("26.12.1");
  });

  it("Dockerfile FROM node:24-alpine -> nodejs likely (floating tag)", async () => {
    const f = only(await findingsFor({ "app/Dockerfile": "FROM node:24-alpine\nRUN npm ci\n" }), "nodejs-2026-10-21");
    expect(f.confidence).toBe("likely");
    expect(f.vars?.variant).toBe("floating");
    expect(f.evidence[0]!.detail).toContain("floating tag, rebuild to pull the patched image");
  });

  it("php 8.3.35 -> php2shell definite", async () => {
    const f = only(await findingsFor({}, { phpVersion: "8.3.35" }), "php2shell-2026");
    expect(f.confidence).toBe("definite");
    expect(f.vars).toEqual({ found: "8.3.35", fixed: "8.3.36" });
  });

  it("php 8.3.36 -> none", async () => {
    expect(await findingsFor({}, { phpVersion: "8.3.36" })).toEqual([]);
  });

  it("php 8.1.30 -> php2shell definite + take offline wording", async () => {
    const f = only(await findingsFor({}, { phpVersion: "8.1.30" }), "php2shell-2026");
    expect(f.confidence).toBe("definite");
    expect(f.vars?.variant).toBe("offline");
  });

  it("litellm 1.107.0 dist-info -> litellm definite", async () => {
    const f = only(await findingsFor({ [`${VENV}/litellm-1.107.0.dist-info/METADATA`]: "Name: litellm\n", "app/.env": SECRET }), "litellm-1.107.0");
    expect(f.confidence).toBe("definite");
    expect(f.vars).toEqual({ found: "1.107.0", fixed: "1.106.2" });
  });

  it("litellm 1.106.2 -> none", async () => {
    expect(await findingsFor({ [`${VENV}/litellm-1.106.2.dist-info/METADATA`]: "Name: litellm\n" })).toEqual([]);
  });

  it("requirements.txt pins litellm==1.107.0, no env -> litellm likely", async () => {
    const f = only(await findingsFor({ "app/requirements.txt": "litellm==1.107.0\n", "app/.env": SECRET }), "litellm-1.107.0");
    expect(f.confidence).toBe("likely");
    expect(f.vars?.variant).toBe("pin");
  });

  it("cook.pth in site-packages -> litellm definite (compromise wording)", async () => {
    const f = only(await findingsFor({ [`${VENV}/cook.pth`]: "import cook\n" }), "litellm-1.107.0");
    expect(f.confidence).toBe("definite");
    expect(f.vars?.variant).toBe("compromise");
  });

  it("only sitecustomize.py -> litellm possible", async () => {
    const f = only(await findingsFor({ [`${VENV}/sitecustomize.py`]: "import os\n" }), "litellm-1.107.0");
    expect(f.confidence).toBe("possible");
    expect(f.vars?.variant).toBe("sitecustomize");
  });

  it(".env with RAILWAY_TOKEN + railway.toml -> railway likely", async () => {
    const f = only(await findingsFor({ "app/.env": `RAILWAY_TOKEN=${CANARY}\n${SECRET}`, "app/railway.toml": "[build]\n" }), "railway-2026-10-21");
    expect(f.confidence).toBe("likely");
    expect(f.evidence.map((e) => e.detail).sort()).toEqual(["RAILWAY_TOKEN", "railway.toml"]);
  });

  it(".env.example with RAILWAY_TOKEN only -> none", async () => {
    expect(await findingsFor({ "app/.env.example": "RAILWAY_TOKEN=\n" })).toEqual([]);
  });

  it("comment line # RAILWAY_TOKEN= -> none", async () => {
    expect(await findingsFor({ "app/.env": `# RAILWAY_TOKEN=${CANARY}\n${SECRET}` })).toEqual([]);
  });

  it("opencode on PATH -> opencode possible", async () => {
    const f = only(await findingsFor({}, { commands: ["opencode"] }), "opencode-console-2026-10-17");
    expect(f.confidence).toBe("possible");
  });

  it("Plex 1.43.3.10860 -> plex2shell definite, KEV priority", async () => {
    const findings = await findingsFor({}, { plexVersion: "1.43.3.10860", nodeVersion: "24.22.0" });
    const f = only(findings, "plex2shell-2026");
    expect(f.confidence).toBe("definite");
    // critical 100 - KEV 50 - due within 3 days 25 - definite 30
    expect(f.priority).toBe(-5);
    expect(findings[0]!.advisoryId).toBe("plex2shell-2026");
  });

  it("Plex 1.43.3.10861 -> none", async () => {
    expect(await findingsFor({}, { plexVersion: "1.43.3.10861" })).toEqual([]);
  });

  it("Node trust store contains emSign ECC Root CA - G3 -> emudhra likely", async () => {
    const f = only(await findingsFor({}, { trustStores: { "emSign ECC Root CA - G3": [{ store: "node", present: true }] } }), "emudhra-weak-ca-keys");
    expect(f.confidence).toBe("likely");
  });

  it("config.region = IN -> sbi fyi", async () => {
    const f = only(await findingsFor({}, {}, "IN"), "sbi-2026-10-21");
    expect(f.confidence).toBe("fyi");
    expect(f.priority).toBeGreaterThan(1000);
  });
});
