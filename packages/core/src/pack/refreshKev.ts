import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { KevEntry } from "../match/finding";
import { loadKevSnapshot } from "./loadPack";

// SPEC 7.5. Fetches the CISA KEV feed (through the egress guard, like every
// fetch), keeps entries added in the last N days, and stores a snapshot.
// Offline or failing: last stored snapshot, else the bundled one.

export const KEV_FEED_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const DAY_MS = 24 * 60 * 60 * 1000;

const KevFeed = z.object({
  catalogVersion: z.string(),
  vulnerabilities: z.array(z.object({
    cveID: z.string(),
    vendorProject: z.string(),
    product: z.string(),
    dateAdded: z.string(),
    dueDate: z.string(),
  }).passthrough()),
}).passthrough();

const StoredSnapshot = z.object({
  catalogVersion: z.string().nullable(),
  fetchedAt: z.string().nullable(),
  vulnerabilities: z.array(z.object({ cveID: z.string(), vendorProject: z.string(), product: z.string(), dateAdded: z.string(), dueDate: z.string() })),
});

export interface KevRefresh {
  entries: KevEntry[];
  source: "network" | "snapshot" | "bundled";
  catalogVersion: string | null;
}

function recent(entries: KevEntry[], now: Date, windowDays: number): KevEntry[] {
  return entries.filter((e) => {
    const added = Date.parse(`${e.dateAdded}T00:00:00Z`);
    return !Number.isNaN(added) && now.getTime() - added <= windowDays * DAY_MS;
  });
}

function readStored(snapshotPath: string): KevRefresh | null {
  try {
    const s = StoredSnapshot.parse(JSON.parse(fs.readFileSync(snapshotPath, "utf8")));
    return { entries: s.vulnerabilities, source: "snapshot", catalogVersion: s.catalogVersion };
  } catch {
    return null;
  }
}

export async function refreshKev(opts: { now: Date; snapshotPath: string; offline?: boolean; windowDays?: number; timeoutMs?: number }): Promise<KevRefresh> {
  const windowDays = opts.windowDays ?? 14;
  if (!opts.offline) {
    try {
      const res = await fetch(KEV_FEED_URL, { signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
      if (res.ok) {
        const feed = KevFeed.parse(await res.json());
        const entries = recent(feed.vulnerabilities.map(({ cveID, vendorProject, product, dateAdded, dueDate }) =>
          ({ cveID, vendorProject, product, dateAdded, dueDate })), opts.now, windowDays);
        fs.mkdirSync(path.dirname(opts.snapshotPath), { recursive: true });
        const tmp = `${opts.snapshotPath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ catalogVersion: feed.catalogVersion, fetchedAt: opts.now.toISOString(), vulnerabilities: entries }, null, 2));
        fs.renameSync(tmp, opts.snapshotPath);
        return { entries, source: "network", catalogVersion: feed.catalogVersion };
      }
    } catch {
      // network down, blocked, or a changed feed format: fall back below
    }
  }
  const stored = readStored(opts.snapshotPath);
  if (stored) return { ...stored, entries: recent(stored.entries, opts.now, windowDays) };
  return { entries: recent(loadKevSnapshot(), opts.now, windowDays), source: "bundled", catalogVersion: null };
}
