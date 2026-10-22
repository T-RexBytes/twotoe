import { buildFinding, HitGroups, itemsOf, type Matcher } from "../finding";
import { cmpDotted, leadingVersion } from "../semverUtil";

// Plex Media Server below 1.43.3.10861 (4-part compare): definite. A
// pms-docker image on a non-version tag ("latest", "public") is possible:
// pull and recreate.
export const matcher: Matcher = {
  advisoryId: "plex2shell-2026",
  match(inv, advisory, config) {
    const p = advisory.check.params as { fixedAtLeast: string; dockerImages: string[] };
    const groups = new HitGroups();
    for (const a of itemsOf(inv, "app").filter((x) => x.name === "plex")) {
      const lv = leadingVersion(a.version);
      if (lv && cmpDotted(lv.version, p.fixedAtLeast) < 0) {
        groups.add("default", { confidence: "definite", found: lv.version, fixed: p.fixedAtLeast, evidence: [{ detector: "appVersion", location: a.source, detail: `Plex Media Server ${lv.version} installed` }] });
      }
    }
    for (const d of itemsOf(inv, "dockerImage").filter((x) => p.dockerImages.includes(x.image))) {
      const lv = leadingVersion(d.tag);
      const evidence = { detector: "dockerTag", location: d.source, detail: `image ${d.image}:${d.tag}` };
      if (lv && lv.parts >= 4) {
        if (cmpDotted(lv.version, p.fixedAtLeast) < 0) groups.add("default", { confidence: "definite", found: lv.version, fixed: p.fixedAtLeast, evidence: [evidence] });
      } else {
        groups.add("confirmImage", { confidence: "possible", found: d.tag, fixed: p.fixedAtLeast, variant: "confirmImage", evidence: [evidence] });
      }
    }
    return groups.hits().map((h) => buildFinding(advisory, h, config));
  },
};
