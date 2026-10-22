import { createHash } from "node:crypto";
import type { Advisory, Confidence, Finding, Inventory, InventoryItem, Severity } from "../schemas";
import { priority } from "./priority";
import { extractRiskyTokens, tokenUnion } from "./tokens";

export type Evidence = Finding["evidence"][number];

export interface MatchConfig {
  region?: string | null;
  now: Date;
  kev?: KevEntry[];
  coveredCves?: string[];   // CVEs owned by pack advisories (set by matchAll)
}

// Fields of a CISA KEV feed entry that the kev-recent matcher uses.
export interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  dateAdded: string;
  dueDate: string;
}

export interface Matcher {
  advisoryId: string;
  match(inventory: Inventory, advisory: Advisory, config: MatchConfig): Finding[];
}

// One root cause before it becomes a Finding.
export interface Hit {
  confidence: Confidence;
  evidence: Evidence[];
  found?: string;
  fixed?: string;
  variant?: string;
  severity?: Severity;
  kev?: boolean;
  kevDueDate?: string | null;
  tokens?: string[];
}

const RANK: Record<Confidence, number> = { fyi: 0, possible: 1, likely: 2, definite: 3 };

export function strongest(a: Confidence, b: Confidence): Confidence {
  return RANK[a] >= RANK[b] ? a : b;
}

export function itemsOf<K extends InventoryItem["kind"]>(inv: Inventory, kind: K): Array<Extract<InventoryItem, { kind: K }>> {
  return inv.items.filter((i): i is Extract<InventoryItem, { kind: K }> => i.kind === kind);
}

function basename(location: string): string {
  const noLine = location.replace(/:\d+$/, "");
  const parts = noLine.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? noLine;
}

// Groups evidence that shares a root cause: same variant and fixed target.
// Evidence is deduped by (detector, location, detail).
export class HitGroups {
  private readonly groups = new Map<string, Hit>();

  add(key: string, hit: Hit): void {
    const g = this.groups.get(key);
    if (!g) {
      this.groups.set(key, { ...hit, evidence: [...hit.evidence], tokens: [...(hit.tokens ?? [])] });
      return;
    }
    g.confidence = strongest(g.confidence, hit.confidence);
    g.evidence.push(...hit.evidence);
    g.tokens!.push(...(hit.tokens ?? []));
    if (hit.found && g.found && !g.found.split(", ").includes(hit.found)) g.found = `${g.found}, ${hit.found}`;
    g.found ??= hit.found;
  }

  hits(): Hit[] {
    return [...this.groups.values()];
  }
}

export function buildFinding(advisory: Advisory, hit: Hit, config: MatchConfig): Finding {
  const seen = new Set<string>();
  const evidence = hit.evidence.filter((e) => {
    const k = `${e.detector}|${e.location}|${e.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const variant = hit.variant ?? "default";
  const fingerprint = [variant, hit.fixed ?? "", ...evidence.map((e) => `${e.detector}|${e.location}`).sort()].join("\n");
  const id = `${advisory.id}:${createHash("sha256").update(fingerprint).digest("hex").slice(0, 8)}`;
  const severity = hit.severity ?? advisory.severity;
  const kev = hit.kev ?? advisory.kev;
  const kevDueDate = hit.kevDueDate !== undefined ? hit.kevDueDate : advisory.kevDueDate;
  const params = advisory.check.params as { fixed?: unknown; fixedAtLeast?: unknown; lastSafe?: unknown; tokens?: unknown };
  const fixedVersions = [
    ...(params.fixed && typeof params.fixed === "object" ? Object.values(params.fixed as Record<string, string>) : []),
    typeof params.fixedAtLeast === "string" ? params.fixedAtLeast : null,
    typeof params.lastSafe === "string" ? params.lastSafe : null,
  ];
  // SPEC 9.1: CVEs + vendor + product + fixed versions + found versions +
  // numbers in summary + evidence basenames.
  const allowedTokens = tokenUnion([
    ...advisory.cves,
    advisory.vendor,
    ...(Array.isArray(params.tokens) ? (params.tokens as string[]) : []),
    ...fixedVersions,
    ...(hit.found ? hit.found.split(", ") : []),
    hit.fixed,
    // Only the summary's tokens, never the sentence itself: models copied the
    // whole 150-200 char summary out of allowedTokens (eval v3, Oct 22).
    ...extractRiskyTokens(advisory.summary),
    kevDueDate,
    // Not in the SPEC 9.1 list, but the 10.4 few-shot says "The Oct 21 Node release".
    advisory.disclosedAt,
    ...evidence.map((e) => basename(e.location)),
    ...(hit.tokens ?? []),
  ]);
  return {
    id,
    advisoryId: advisory.id,
    confidence: hit.confidence,
    severity,
    priority: priority({ severity, kev, kevDueDate, confidence: hit.confidence, now: config.now }),
    evidence,
    allowedTokens,
    vars: {
      ...(hit.found ? { found: hit.found } : {}),
      ...(hit.fixed ? { fixed: hit.fixed } : {}),
      ...(hit.variant ? { variant: hit.variant } : {}),
    },
  };
}
