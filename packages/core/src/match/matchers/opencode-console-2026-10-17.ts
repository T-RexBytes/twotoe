import { buildFinding, itemsOf, type Matcher } from "../finding";

// The breach hit Console users with linked provider keys, which nothing on disk
// can prove. The CLI or its config folder only means "you might use Console":
// always possible, never higher (SPEC 2.6).
export const matcher: Matcher = {
  advisoryId: "opencode-console-2026-10-17",
  match(inv, advisory, config) {
    const p = advisory.check.params as { cli: string; configDirCandidates: string[] };
    const evidence = itemsOf(inv, "marker")
      .filter((m) => m.marker === `cli:${p.cli}` || p.configDirCandidates.some((d) => m.marker === `home:${d}`))
      .map((m) => ({
        detector: "opencodePresence",
        location: m.path,
        detail: m.marker.startsWith("cli:") ? "opencode on PATH" : "opencode config folder exists",
      }));
    if (!evidence.length) return [];
    return [buildFinding(advisory, { confidence: "possible", evidence }, config)];
  },
};
