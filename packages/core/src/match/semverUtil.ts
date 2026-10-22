import semver from "semver";

// "Is the found version below the fixed version for its line?" (SPEC 9.2, exact behavior)
export function belowFixed(found: string, fixedByLine: Record<string, string>): "vulnerable" | "fixed" | "unknownLine" {
  const v = semver.coerce(found);            // tolerant of "8.3.35-cli"
  if (!v) return "unknownLine";
  const line2 = `${v.major}.${v.minor}`, line1 = `${v.major}`;
  const fixed = fixedByLine[line2] ?? fixedByLine[line1];
  if (!fixed) return "unknownLine";
  return semver.lt(v, semver.coerce(fixed)!) ? "vulnerable" : "fixed";
}

// Plex uses 4-part versions like 1.43.3.10861: compare as integer tuples, not semver.
export function cmpDotted(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export type LineStatus = "vulnerable" | "fixed" | "belowLines" | "aboveLines" | "gap";

// belowFixed, plus where an unknown line sits relative to the fixed lines:
// below all of them (out of support), above all of them (newer than the
// advisory), or in a gap between them (an end-of-life odd line like Node 25).
export function lineStatus(found: string, fixedByLine: Record<string, string>): LineStatus {
  const r = belowFixed(found, fixedByLine);
  if (r !== "unknownLine") return r;
  const v = semver.coerce(found);
  const lines = Object.keys(fixedByLine);
  if (!v || lines.length === 0) return "gap";
  const key = lines[0]!.includes(".") ? `${v.major}.${v.minor}` : `${v.major}`;
  const sorted = [...lines].sort(cmpDotted);
  if (cmpDotted(key, sorted[0]!) < 0) return "belowLines";
  if (cmpDotted(key, sorted[sorted.length - 1]!) > 0) return "aboveLines";
  return "gap";
}

// Leading numeric version of a version string or docker tag, and how many
// parts it has: "24.22.0-alpine" -> 24.22.0 (3), "24-alpine" -> 24 (1),
// "1.43.3.10861-abc" -> (4), "latest" -> null.
export function leadingVersion(s: string): { version: string; parts: number } | null {
  const m = s.trim().replace(/^v/, "").match(/^(\d+(?:\.\d+){0,3})(?![\d.])/);
  if (!m) return null;
  return { version: m[1]!, parts: m[1]!.split(".").length };
}

// Smallest fixed release across all lines (the "move to at least" target).
export function lowestFixed(fixedByLine: Record<string, string>): string {
  return Object.values(fixedByLine).sort(cmpDotted)[0]!;
}
