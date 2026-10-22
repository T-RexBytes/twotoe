import { buildFinding, itemsOf, type KevEntry, type Matcher } from "../finding";

const DAY_MS = 24 * 60 * 60 * 1000;

export function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// SPEC 7.5: CISA KEV entries added in the window whose product matches an
// inventory name exactly (normalized) are likely; a vendor-only match is
// possible. CVEs already covered by a pack advisory are skipped so a KEV item
// never duplicates, say, the Plex finding.
export const matcher: Matcher = {
  advisoryId: "kev-recent",
  match(inv, advisory, config) {
    const p = advisory.check.params as { windowDays: number };
    const entries: KevEntry[] = config.kev ?? [];
    const covered = new Set(config.coveredCves ?? []);
    const names = new Map<string, string>();
    const addName = (n: string, label: string) => { if (normName(n)) names.set(normName(n), label); };
    for (const r of itemsOf(inv, "runtime")) addName(r.name, `${r.name} (${r.source})`);
    for (const a of itemsOf(inv, "app")) addName(a.name, `${a.name} (${a.source})`);
    for (const pk of itemsOf(inv, "package")) addName(pk.name, `${pk.name} ${pk.version}`);
    for (const d of itemsOf(inv, "dockerImage")) addName(d.image.split("/").pop()!, `${d.image}:${d.tag}`);

    const out = [];
    for (const e of entries) {
      if (covered.has(e.cveID)) continue;
      const added = Date.parse(`${e.dateAdded}T00:00:00Z`);
      if (Number.isNaN(added) || config.now.getTime() - added > p.windowDays * DAY_MS) continue;
      const product = names.get(normName(e.product));
      const vendor = product ? undefined : names.get(normName(e.vendorProject));
      const hit = product ?? vendor;
      if (!hit) continue;
      out.push(buildFinding(advisory, {
        confidence: product ? "likely" : "possible",
        ...(product ? {} : { variant: "confirm" }),
        found: e.product,
        fixed: e.dueDate,
        kevDueDate: e.dueDate,
        tokens: [e.cveID, e.vendorProject, e.product],
        evidence: [{ detector: "kevProductMatch", location: hit, detail: `${e.cveID} (${e.vendorProject} ${e.product}), due ${e.dueDate}` }],
      }, config));
    }
    return out;
  },
};
