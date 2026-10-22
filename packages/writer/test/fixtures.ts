import { loadPack, matchAll, type Finding, type Inventory, type InventoryItem } from "@twotoe/core";
import type { BriefDraft } from "../src/draft";
import { templateDraft } from "../src/template";

export const pack = loadPack();
export const NOW = new Date("2026-10-23T07:00:00+05:30");
export const ROOTS = ["~\\code"];

export function inv(items: InventoryItem[]): Inventory {
  return { scannedAt: "2026-10-23T01:30:00.000Z", roots: ROOTS, durationMs: 1, items, checksRun: items.length };
}

export const KITCHEN: InventoryItem[] = [
  { kind: "runtime", name: "node", version: "24.22.0", source: "node --version" },
  { kind: "app", name: "plex", version: "1.43.3.10860", source: "Plex Media Server" },
  { kind: "package", ecosystem: "pypi", name: "litellm", version: "1.107.0", source: "site-packages:~\\code\\ai\\.venv\\Lib\\site-packages" },
  { kind: "envKey", key: "RAILWAY_TOKEN", file: "~\\code\\rail\\.env" },
  { kind: "marker", marker: "railway.toml", path: "~\\code\\rail\\railway.toml" },
  { kind: "marker", marker: "cli:opencode", path: "PATH" },
];

export function kitchenFindings(region: string | null = "IN"): Finding[] {
  return matchAll(inv(KITCHEN), pack, { now: NOW, region });
}

export const kevOf = (f: Finding) => pack.advisories.find((a) => a.id === f.advisoryId)?.kev ?? false;

// A draft that should pass: the template, which only uses pack facts.
export function goodDraft(findings: Finding[]): BriefDraft {
  return structuredClone(templateDraft(findings, pack));
}
