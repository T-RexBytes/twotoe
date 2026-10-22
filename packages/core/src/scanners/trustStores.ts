import { pemBundleHas } from "../probe/RealProbe";
import type { SystemProbe } from "../probe/SystemProbe";

// SPEC 8.2.9: OS / Node / Git stores through the probe, plus every certifi
// bundle found in a discovered site-packages (text search, no import).

export interface TrustHit {
  store: string;
  subject: string;
  present: boolean;
}

export async function scanTrustStores(
  probe: SystemProbe,
  subjects: string[],
  certifiPems: Array<{ pem: string; label: string }>,
): Promise<{ hits: TrustHit[]; checks: number }> {
  const hits: TrustHit[] = [];
  let checks = 0;
  for (const subject of subjects) {
    checks++;
    for (const s of await probe.trustStoreHas(subject)) hits.push({ ...s, subject });
    for (const { pem, label } of certifiPems) {
      checks++;
      hits.push({ store: `certifi:${label}`, subject, present: await pemBundleHas(pem, subject) });
    }
  }
  return { hits, checks };
}
