import type { AdvisoryPack, Finding, Inventory } from "../schemas";
import type { KevEntry, MatchConfig, Matcher } from "./finding";
import { matcher as emudhra } from "./matchers/emudhra-weak-ca-keys";
import { matcher as gitlab110264 } from "./matchers/gitlab-cve-2026-110264";
import { matcher as gitlab97229 } from "./matchers/gitlab-cve-2026-97229";
import { matcher as kevRecent } from "./matchers/kev-recent";
import { matcher as litellm } from "./matchers/litellm-1.107.0";
import { matcher as nodejs } from "./matchers/nodejs-2026-10-21";
import { matcher as opencode } from "./matchers/opencode-console-2026-10-17";
import { matcher as php } from "./matchers/php2shell-2026";
import { matcher as plex } from "./matchers/plex2shell-2026";
import { matcher as railway } from "./matchers/railway-2026-10-21";
import { matcher as sbi } from "./matchers/sbi-2026-10-21";
import { compareFindings } from "./priority";

export const MATCHERS: Record<string, Matcher> = Object.fromEntries(
  [litellm, railway, opencode, php, nodejs, gitlab110264, gitlab97229, plex, emudhra, sbi, kevRecent]
    .map((m) => [m.advisoryId, m]),
);

export interface MatchAllConfig {
  region?: string | null;
  now?: Date;
  kev?: KevEntry[];
}

// Pure: Inventory x Advisories -> Findings, sorted by priority (SPEC 9.1).
// No I/O, no clock unless `now` is omitted.
export function matchAll(inventory: Inventory, pack: AdvisoryPack, config: MatchAllConfig = {}): Finding[] {
  const full: MatchConfig = {
    region: config.region ?? null,
    now: config.now ?? new Date(),
    kev: config.kev ?? [],
    coveredCves: pack.advisories.filter((a) => a.id !== "kev-recent").flatMap((a) => a.cves),
  };
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const advisory of pack.advisories) {
    const m = MATCHERS[advisory.id];
    if (!m) throw new Error(`no matcher for advisory ${advisory.id}`);
    for (const f of m.match(inventory, advisory, full)) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      findings.push(f);
    }
  }
  return findings.sort(compareFindings);
}
