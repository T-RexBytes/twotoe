import fs from "node:fs";
import path from "node:path";
import {
  installEgressGuard, Ledger, loadKevSnapshot, loadPack, redactText, refreshKev, twotoeHome, type AdvisoryPack, type KevRefresh,
} from "@twotoe/core";

// SPEC 12 `twotoe pack`: pack version, verifiedAt dates, open VERIFY items,
// and the KEV snapshot. --refresh fetches the CISA KEV feed through the guard.

export interface PackOptions {
  refresh?: boolean;
  stateDir?: string;
  json?: boolean;
  now?: Date;
}

// Paths of literal "VERIFY" placeholders (docs/VERIFY.md lists each).
export function verifyPlaceholders(value: unknown, at = ""): string[] {
  if (value === "VERIFY") return [at];
  if (Array.isArray(value)) return value.flatMap((v, i) => verifyPlaceholders(v, `${at}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => verifyPlaceholders(v, at ? `${at}.${k}` : k));
  return [];
}

interface StoredKev { catalogVersion: string | null; fetchedAt: string | null; count: number }

function readStoredKev(file: string): StoredKev | null {
  try {
    const s = JSON.parse(fs.readFileSync(file, "utf8")) as { catalogVersion?: string; fetchedAt?: string; vulnerabilities?: unknown[] };
    return { catalogVersion: s.catalogVersion ?? null, fetchedAt: s.fetchedAt ?? null, count: s.vulnerabilities?.length ?? 0 };
  } catch {
    return null;
  }
}

export function renderPack(pack: AdvisoryPack, stored: StoredKev | null, refreshed: KevRefresh | null, bundledKev: number): string {
  const out: string[] = [];
  out.push(`  advisory pack ${pack.packVersion} (generated ${pack.generatedAt})`, "");
  const w = Math.max(...pack.advisories.map((a) => a.id.length));
  out.push(`  ${"id".padEnd(w)}  ${"severity".padEnd(8)}  kev  checked     sources`);
  for (const a of pack.advisories) {
    out.push(`  ${a.id.padEnd(w)}  ${a.severity.padEnd(8)}  ${a.kev ? "yes" : "no "}  ${a.verifiedAt.padEnd(10)}  ${a.sourceUrls.length}`);
  }
  const open = pack.advisories.flatMap((a) => verifyPlaceholders(a, a.id));
  out.push("", open.length ? `  ${open.length} unverified value(s), listed in docs/VERIFY.md:` : "  No unverified values.");
  for (const p of open) out.push(`    ${p}`);
  out.push("", "  CISA KEV");
  if (refreshed) {
    out.push(refreshed.source === "network"
      ? `    refreshed now: catalog ${refreshed.catalogVersion}, ${refreshed.entries.length} entries added in the last 14 days`
      : `    refresh failed, using the ${refreshed.source} snapshot (${refreshed.entries.length} recent entries)`);
  } else if (stored) {
    out.push(`    stored snapshot: catalog ${stored.catalogVersion ?? "unknown"}, fetched ${stored.fetchedAt ?? "unknown"}, ${stored.count} entries`);
  } else {
    out.push(`    no stored snapshot yet; the bundled one has ${bundledKev} entries. Run \`twotoe pack --refresh\`.`);
  }
  return out.join("\n");
}

export async function runPack(opts: PackOptions): Promise<number> {
  const pack = loadPack();
  const snapshotPath = path.join(path.resolve(opts.stateDir ?? twotoeHome()), "kev-snapshot.json");
  let refreshed: KevRefresh | null = null;
  const ledger = new Ledger();
  if (opts.refresh) {
    const uninstall = installEgressGuard({ ledger });
    try {
      refreshed = await refreshKev({ now: opts.now ?? new Date(), snapshotPath });
    } finally {
      uninstall();
    }
  }
  const stored = readStoredKev(snapshotPath);
  const text = opts.json
    ? JSON.stringify({
      packVersion: pack.packVersion,
      generatedAt: pack.generatedAt,
      advisories: pack.advisories.map((a) => ({ id: a.id, severity: a.severity, kev: a.kev, verifiedAt: a.verifiedAt, sourceUrls: a.sourceUrls })),
      unverified: pack.advisories.flatMap((a) => verifyPlaceholders(a, a.id)),
      kev: refreshed ? { source: refreshed.source, catalogVersion: refreshed.catalogVersion, recentEntries: refreshed.entries.length } : stored,
      egress: ledger.entries(),
    }, null, 2)
    : renderPack(pack, stored, refreshed, loadKevSnapshot().length);
  process.stdout.write(`${redactText(text)}\n`);
  return refreshed && refreshed.source !== "network" ? 2 : 0;
}
