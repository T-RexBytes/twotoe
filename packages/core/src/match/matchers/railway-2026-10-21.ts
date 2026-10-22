import { isTemplateEnvFile } from "../../scanners/envKeys";
import type { Finding } from "../../schemas";
import { buildFinding, itemsOf, type Matcher } from "../finding";

type Evidence = Finding["evidence"][number];

// SPEC 9.3: a RAILWAY_* key name in a real env file plus a Railway marker
// (railway.toml/json, the CLI, ~\.railway) is likely. One signal alone is
// possible. Keys in .env.example/.sample/.template never count.
export const matcher: Matcher = {
  advisoryId: "railway-2026-10-21",
  match(inv, advisory, config) {
    const p = advisory.check.params as { envKeyPrefixes: string[]; projectMarkerFiles: string[]; homeMarkerDirs: string[]; cli: string };
    const keys: Evidence[] = itemsOf(inv, "envKey")
      .filter((k) => !isTemplateEnvFile(k.file) && p.envKeyPrefixes.some((pre) => k.key.toUpperCase().startsWith(pre)))
      .map((k) => ({ detector: "envKeys", location: k.file, detail: k.key }));
    const markers: Evidence[] = itemsOf(inv, "marker")
      .filter((m) => p.projectMarkerFiles.includes(m.marker)
        || m.marker === `cli:${p.cli}`
        || p.homeMarkerDirs.some((d) => m.marker === `home:${d}`))
      .map((m) => ({ detector: "railwayMarkers", location: m.path, detail: m.marker.startsWith("cli:") ? "railway CLI on PATH" : m.marker }));
    if (!keys.length && !markers.length) return [];
    const both = keys.length > 0 && markers.length > 0;
    return [buildFinding(advisory, {
      confidence: both ? "likely" : "possible",
      ...(both ? {} : { variant: "confirm" }),
      evidence: [...markers, ...keys],
      tokens: keys.map((k) => k.detail),
    }, config)];
  },
};
