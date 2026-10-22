import { describe, expect, it } from "vitest";
import {
  Advisory, Brief, ChecklistItem, Confidence, Finding, Inventory, InventoryItem, Severity,
} from "../src/schemas";

const advisory = {
  id: "nodejs-2026-10-21",
  title: "Node.js October 2026 security releases",
  vendor: "Node.js",
  cves: ["CVE-2026-111497"],
  severity: "high",
  kev: false,
  kevDueDate: null,
  disclosedAt: "2026-10-21",
  sourceUrls: ["https://nodejs.org/en/blog/vulnerability/october-2026-security-releases"],
  verifiedAt: "2026-10-22",
  summary: "Node.js 24.22.1 fixes CVE-2026-111497.",
  action: "Upgrade Node to the fixed release for your line",
  check: { detector: "runtimeVersion", params: { fixed: { "24": "24.22.1" } } },
};

const finding = {
  id: "nodejs-2026-10-21:abc123",
  advisoryId: "nodejs-2026-10-21",
  confidence: "definite",
  severity: "high",
  priority: 170,
  evidence: [{ detector: "runtimeVersion", location: "node --version", detail: "24.22.0" }],
  allowedTokens: ["Node.js", "24.22.0", "24.22.1", "CVE-2026-111497"],
};

const brief = {
  date: "2026-10-23",
  line1: "1 thing needs you today: upgrade Node to 24.22.1.",
  line2: "Everything else: you're fine. Checked 412 things in 9s, 0 secrets left this machine.",
  checklist: [{ findingId: finding.id, action: "Upgrade Node to 24.22.1", why: "Your Node 24.22.0 misses 10 security fixes." }],
  fyi: [],
  meta: {
    mode: "template",
    model: null,
    attempts: 0,
    validatorRejections: [],
    durationMs: 12,
    egress: [{ host: "127.0.0.1", method: "POST", bytesOut: 2048 }],
  },
};

// Round trip: parse, serialize to JSON, parse again, expect identical data.
function roundTrip<T>(schema: { parse(v: unknown): T }, value: unknown): T {
  const once = schema.parse(value);
  const twice = schema.parse(JSON.parse(JSON.stringify(once)));
  expect(twice).toEqual(once);
  return twice;
}

describe("enums", () => {
  it("accepts the spec values and nothing else", () => {
    expect(Confidence.options).toEqual(["definite", "likely", "possible", "fyi"]);
    expect(Severity.options).toEqual(["critical", "high", "medium", "info"]);
    expect(Confidence.safeParse("certain").success).toBe(false);
    expect(Severity.safeParse("low").success).toBe(false);
  });
});

describe("InventoryItem", () => {
  const valid = [
    { kind: "runtime", name: "node", version: "24.22.0", source: "node --version" },
    { kind: "package", ecosystem: "pypi", name: "litellm", version: "1.107.0", source: "~/code/x/.venv" },
    { kind: "app", name: "plex", version: "1.43.3.10860", source: "Plex Media Server.exe" },
    { kind: "dockerImage", image: "node", tag: "24-alpine", source: "Dockerfile:1" },
    { kind: "envKey", key: "RAILWAY_TOKEN", file: "~/code/x/.env" },
    { kind: "iocFile", filename: "cook.pth", dir: "~/code/x/.venv/Lib/site-packages", size: 120, sha256: "a".repeat(64) },
    { kind: "trustAnchor", store: "node", subject: "emSign ECC Root CA - G3", present: true },
    { kind: "marker", marker: "railway.toml", path: "~/code/x/railway.toml" },
  ];

  it.each(valid)("round-trips $kind", (item) => {
    roundTrip(InventoryItem, item);
  });

  it("rejects unknown kinds and runtimes", () => {
    expect(InventoryItem.safeParse({ kind: "secret", key: "X" }).success).toBe(false);
    expect(InventoryItem.safeParse({ kind: "runtime", name: "ruby", version: "3.3.0", source: "x" }).success).toBe(false);
  });

  it("strips anything beyond the key name from envKey items", () => {
    const parsed = InventoryItem.parse({ kind: "envKey", key: "OPENAI_API_KEY", file: ".env", value: "TWOTOE_CANARY_9f3a" });
    expect(JSON.stringify(parsed)).not.toContain("TWOTOE_CANARY_9f3a");
  });

  it("requires numeric size on iocFile", () => {
    expect(InventoryItem.safeParse({ kind: "iocFile", filename: "cook.py", dir: "d", size: "1", sha256: "x" }).success).toBe(false);
  });
});

describe("Inventory", () => {
  it("round-trips and requires an ISO datetime", () => {
    const inv = { scannedAt: "2026-10-23T03:00:00.000Z", roots: ["~/code"], durationMs: 9000, items: [], checksRun: 412 };
    roundTrip(Inventory, inv);
    expect(Inventory.safeParse({ ...inv, scannedAt: "last night" }).success).toBe(false);
  });
});

describe("Advisory", () => {
  it("round-trips", () => {
    roundTrip(Advisory, advisory);
    roundTrip(Advisory, { ...advisory, regions: ["IN"] });
  });

  it("needs at least one valid source URL", () => {
    expect(Advisory.safeParse({ ...advisory, sourceUrls: [] }).success).toBe(false);
    expect(Advisory.safeParse({ ...advisory, sourceUrls: ["nodejs.org"] }).success).toBe(false);
  });

  it("rejects a missing check or a bad severity", () => {
    const { check: _check, ...noCheck } = advisory;
    expect(Advisory.safeParse(noCheck).success).toBe(false);
    expect(Advisory.safeParse({ ...advisory, severity: "varies" }).success).toBe(false);
  });
});

describe("Finding", () => {
  it("round-trips", () => {
    roundTrip(Finding, finding);
  });

  it("rejects unknown confidence and non-numeric priority", () => {
    expect(Finding.safeParse({ ...finding, confidence: "sure" }).success).toBe(false);
    expect(Finding.safeParse({ ...finding, priority: "high" }).success).toBe(false);
  });
});

describe("Brief", () => {
  it("round-trips", () => {
    roundTrip(Brief, brief);
  });

  it("caps line length at 160", () => {
    expect(Brief.safeParse({ ...brief, line1: "x".repeat(160) }).success).toBe(true);
    expect(Brief.safeParse({ ...brief, line1: "x".repeat(161) }).success).toBe(false);
    expect(Brief.safeParse({ ...brief, line2: "x".repeat(161) }).success).toBe(false);
    expect(Brief.safeParse({ ...brief, fyi: ["x".repeat(161)] }).success).toBe(false);
  });

  it("caps the checklist at 7 and FYI at 3", () => {
    const item = brief.checklist[0];
    expect(Brief.safeParse({ ...brief, checklist: Array(7).fill(item) }).success).toBe(true);
    expect(Brief.safeParse({ ...brief, checklist: Array(8).fill(item) }).success).toBe(false);
    expect(Brief.safeParse({ ...brief, fyi: Array(4).fill("ok") }).success).toBe(false);
  });

  it("caps checklist action at 90 and why at 140", () => {
    expect(ChecklistItem.safeParse({ findingId: "f", action: "a".repeat(90), why: "w".repeat(140) }).success).toBe(true);
    expect(ChecklistItem.safeParse({ findingId: "f", action: "a".repeat(91), why: "w" }).success).toBe(false);
    expect(ChecklistItem.safeParse({ findingId: "f", action: "a", why: "w".repeat(141) }).success).toBe(false);
  });

  it("only allows the three modes", () => {
    expect(Brief.safeParse({ ...brief, meta: { ...brief.meta, mode: "llm-fallback", model: "gemma4:e4b" } }).success).toBe(true);
    expect(Brief.safeParse({ ...brief, meta: { ...brief.meta, mode: "cloud" } }).success).toBe(false);
  });
});
