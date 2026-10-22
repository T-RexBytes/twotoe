import path from "node:path";
import type { SystemProbe } from "../probe/SystemProbe";

// SPEC 8.2.7: Railway and OpenCode presence. Existence only: marker files and
// home directories are never opened.

export const MARKER_CLIS = ["railway", "opencode"] as const;

export interface MarkerHit {
  marker: string;   // "railway.toml", "cli:railway", "home:.railway"
  path: string;
}

export function projectMarkerHits(railwayFiles: string[]): MarkerHit[] {
  return railwayFiles.map((f) => ({ marker: path.basename(f).toLowerCase(), path: f }));
}

export async function machineMarkerHits(probe: SystemProbe): Promise<{ hits: MarkerHit[]; checks: number }> {
  const hits: MarkerHit[] = [];
  for (const cli of MARKER_CLIS) {
    if (await probe.commandExists(cli)) hits.push({ marker: `cli:${cli}`, path: "PATH" });
  }
  for (const m of await probe.homeMarkers()) {
    // "~\.config\opencode" -> "home:.config/opencode"
    const rel = m.replace(/^~[\\/]/, "").split(/[\\/]/).join("/");
    hits.push({ marker: `home:${rel}`, path: m });
  }
  return { hits, checks: MARKER_CLIS.length + 1 };
}
