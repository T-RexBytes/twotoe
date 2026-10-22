import { z } from "zod";

// Contracts from docs/SPEC.md section 6. Everything downstream depends on these;
// change them only together with the spec.

export const Confidence = z.enum(["definite", "likely", "possible", "fyi"]);
export type Confidence = z.infer<typeof Confidence>;
export const Severity = z.enum(["critical", "high", "medium", "info"]);
export type Severity = z.infer<typeof Severity>;

// ---------- Inventory (facts collected, no judgment) ----------
export const InventoryItem = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("runtime"), name: z.enum(["node", "php", "python"]),
             version: z.string(), source: z.string() }),          // source: "node --version", "Dockerfile:3"
  z.object({ kind: z.literal("package"), ecosystem: z.enum(["npm", "pypi"]),
             name: z.string(), version: z.string(), source: z.string() }),
  z.object({ kind: z.literal("app"), name: z.enum(["plex", "gitlab"]),
             version: z.string(), source: z.string() }),
  z.object({ kind: z.literal("dockerImage"), image: z.string(), tag: z.string(),
             source: z.string() }),
  z.object({ kind: z.literal("envKey"), key: z.string(), file: z.string() }),  // NAME ONLY
  z.object({ kind: z.literal("iocFile"), filename: z.string(), dir: z.string(),
             size: z.number(), sha256: z.string() }),
  z.object({ kind: z.literal("trustAnchor"), store: z.string(), subject: z.string(),
             present: z.boolean() }),
  z.object({ kind: z.literal("marker"), marker: z.string(), path: z.string() }), // railway.toml, opencode cli
]);
export type InventoryItem = z.infer<typeof InventoryItem>;

export const Inventory = z.object({
  scannedAt: z.string().datetime(),
  roots: z.array(z.string()),
  durationMs: z.number(),
  items: z.array(InventoryItem),
  checksRun: z.number(),               // used for "Checked X things" in line 2
});
export type Inventory = z.infer<typeof Inventory>;

// ---------- Advisory pack ----------
export const Advisory = z.object({
  id: z.string(),                      // "litellm-1.107.0"
  title: z.string(),
  vendor: z.string(),
  cves: z.array(z.string()),
  severity: Severity,
  kev: z.boolean(),
  kevDueDate: z.string().nullable(),
  disclosedAt: z.string(),             // ISO date
  sourceUrls: z.array(z.string().url()).min(1),
  verifiedAt: z.string(),              // when a human/Claude last checked the source
  summary: z.string(),                 // one factual sentence, used by template + allowed tokens
  action: z.string(),                  // canonical imperative action
  check: z.object({
    detector: z.string(),              // name of matcher
    params: z.record(z.any()),
  }),
  regions: z.array(z.string()).optional(), // e.g. ["IN"] for FYI items
});
export type Advisory = z.infer<typeof Advisory>;

// Wrapper for packages/core/src/pack/advisories.json (not in SPEC section 6;
// added so the bundled pack carries its own version and build date).
export const AdvisoryPack = z.object({
  packVersion: z.string(),
  generatedAt: z.string(),
  advisories: z.array(Advisory).min(1),
}).superRefine((pack, ctx) => {
  const seen = new Set<string>();
  pack.advisories.forEach((a, i) => {
    if (seen.has(a.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["advisories", i, "id"],
                     message: `duplicate advisory id ${a.id}` });
    }
    seen.add(a.id);
  });
});
export type AdvisoryPack = z.infer<typeof AdvisoryPack>;

// ---------- Findings (matcher output) ----------
export const Finding = z.object({
  id: z.string(),                      // `${advisoryId}:${hash(evidence)}`
  advisoryId: z.string(),
  confidence: Confidence,
  severity: Severity,
  priority: z.number(),                // lower = more urgent, see 7.4
  evidence: z.array(z.object({ detector: z.string(), location: z.string(), detail: z.string() })),
  allowedTokens: z.array(z.string()),  // every number/CVE/vendor/version the writer may mention
});
export type Finding = z.infer<typeof Finding>;

// ---------- Brief (writer output after validation) ----------
export const ChecklistItem = z.object({
  findingId: z.string(),
  action: z.string().max(90),
  why: z.string().max(140),
});
export type ChecklistItem = z.infer<typeof ChecklistItem>;
export const Brief = z.object({
  date: z.string(),
  line1: z.string().max(160),
  line2: z.string().max(160),
  checklist: z.array(ChecklistItem).max(7),
  fyi: z.array(z.string().max(160)).max(3),
  meta: z.object({
    mode: z.enum(["llm", "template", "llm-fallback"]),
    model: z.string().nullable(),
    attempts: z.number(),
    validatorRejections: z.array(z.string()),
    durationMs: z.number(),
    egress: z.array(z.object({ host: z.string(), method: z.string(), bytesOut: z.number() })),
  }),
});
export type Brief = z.infer<typeof Brief>;
