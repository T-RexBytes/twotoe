import { buildFinding, type Matcher } from "../finding";

// Not machine-checkable: shown as FYI only when the configured region matches.
export const matcher: Matcher = {
  advisoryId: "sbi-2026-10-21",
  match(_inv, advisory, config) {
    const region = config.region?.trim().toUpperCase();
    if (!region || !(advisory.regions ?? []).map((r) => r.toUpperCase()).includes(region)) return [];
    return [buildFinding(advisory, {
      confidence: "fyi",
      evidence: [{ detector: "region", location: "config", detail: `region ${region}` }],
    }, config)];
  },
};
