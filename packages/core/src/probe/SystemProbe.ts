// Every machine-level fact goes through this interface (SPEC 8.1), so the eval
// and the public demo can swap in fixtures without touching scanner code.
export interface SystemProbe {
  platform(): Promise<"win32" | "darwin" | "linux" | "other">;
  nodeVersion(): Promise<string | null>;          // version of the *user's* default node
  phpVersion(): Promise<string | null>;
  plexVersion(): Promise<string | null>;
  gitlabVersion(): Promise<string | null>;
  dockerImages(): Promise<Array<{ repo: string; tag: string }>>;
  trustStoreHas(subject: string): Promise<Array<{ store: string; present: boolean }>>;
  commandExists(cmd: string): Promise<boolean>;
  homeMarkers(): Promise<string[]>;               // e.g. "~\.railway" exists (existence only)
}

// Optional side channel for things the brief meta should mention
// ("docker not running"). Not part of the SPEC interface.
export interface ProbeNotes {
  notes(): string[];
}

// Home-relative directories whose existence is a marker. Never read.
export const HOME_MARKER_DIRS = [
  ".railway",
  ".config/opencode",
  ".local/share/opencode",
  "AppData/Roaming/opencode",
] as const;

// Turns "v24.22.0\n" into "24.22.0".
export function normalizeVersion(raw: string): string | null {
  const m = raw.trim().match(/^v?(\d+(?:\.\d+)*)/);
  return m?.[1] ?? null;
}

export function parsePhpVersion(stdout: string): string | null {
  return stdout.match(/PHP (\d+\.\d+\.\d+)/)?.[1] ?? null;
}

// Subject strings come from PowerShell ("CN=a, O=b") or Node's X509Certificate
// ("C=IN, OU=x, CN=a"). Match the CN exactly, not as a substring, so
// "emSign ECC Root CA - G3" never matches "emSign ECC Root CA - C3".
export function subjectHasCN(subjectLine: string, cn: string): boolean {
  for (const part of subjectLine.split(/,\s*|\n/)) {
    const m = part.trim().match(/^CN=(.*)$/i);
    if (m && m[1]!.trim() === cn) return true;
  }
  return false;
}
