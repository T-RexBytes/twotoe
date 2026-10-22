import { z } from "zod";
import bundled from "./advisories.json";
import kevSnapshot from "./kev-snapshot.json";
import type { KevEntry } from "../match/finding";
import { AdvisoryPack } from "../schemas";

// Parses the bundled pack through the zod schema so a bad edit fails loudly at load.
export function loadPack(raw: unknown = bundled): AdvisoryPack {
  return AdvisoryPack.parse(raw);
}

const KevSnapshot = z.object({
  vulnerabilities: z.array(z.object({
    cveID: z.string(),
    vendorProject: z.string(),
    product: z.string(),
    dateAdded: z.string(),
    dueDate: z.string(),
  }).passthrough()),
}).passthrough();

// Entries from the bundled CISA KEV snapshot (empty until refreshKev runs).
export function loadKevSnapshot(raw: unknown = kevSnapshot): KevEntry[] {
  return KevSnapshot.parse(raw).vulnerabilities.map(({ cveID, vendorProject, product, dateAdded, dueDate }) =>
    ({ cveID, vendorProject, product, dateAdded, dueDate }));
}
