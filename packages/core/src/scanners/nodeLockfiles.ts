// SPEC 8.2.5 (SHOULD) plus the Node version files from 8.2.1. Parse only,
// never install. Only name and version are kept; `resolved` URLs (which can
// carry registry tokens) are never read into results.

export interface NameVersion {
  name: string;
  version: string;
}

function dedupe(list: NameVersion[]): NameVersion[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    const k = `${p.name}@${p.version}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// package-lock.json v2/v3 `packages` map, with a v1 `dependencies` fallback.
export function parseNpmLock(text: string): NameVersion[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const out: NameVersion[] = [];
  const root = data as { packages?: Record<string, { name?: unknown; version?: unknown }>; dependencies?: Record<string, unknown> };
  if (root.packages && typeof root.packages === "object") {
    for (const [key, entry] of Object.entries(root.packages)) {
      if (!key || !entry || typeof entry.version !== "string") continue;
      const idx = key.lastIndexOf("node_modules/");
      const name = typeof entry.name === "string" ? entry.name : idx >= 0 ? key.slice(idx + "node_modules/".length) : null;
      if (name) out.push({ name, version: entry.version });
    }
  } else if (root.dependencies && typeof root.dependencies === "object") {
    const walk = (deps: Record<string, unknown>) => {
      for (const [name, entry] of Object.entries(deps)) {
        const e = entry as { version?: unknown; dependencies?: Record<string, unknown> };
        if (typeof e?.version === "string") out.push({ name, version: e.version });
        if (e?.dependencies) walk(e.dependencies);
      }
    };
    walk(root.dependencies);
  }
  return dedupe(out);
}

// pnpm-lock.yaml v5 to v9, line based (no YAML parser needed for keys).
export function parsePnpmLock(text: string): NameVersion[] {
  const out: NameVersion[] = [];
  let inPackages = false;
  for (const raw of text.split(/\r?\n/)) {
    if (/^\S/.test(raw)) {
      inPackages = raw.trim() === "packages:";
      continue;
    }
    if (!inPackages || !/^ {2}\S/.test(raw)) continue;
    // Peer suffixes like "(foo@1.0.0)" come off first so the last "@" is the version's.
    const key = raw.trim().replace(/:$/, "").replace(/^['"]|['"]$/g, "").replace(/^\//, "").replace(/\(.*$/, "");
    const at = key.lastIndexOf("@");
    if (at > 0) {
      const version = key.slice(at + 1);
      if (/^\d/.test(version)) { out.push({ name: key.slice(0, at), version }); continue; }
    }
    // v5: /name/1.2.3 or /@scope/name/1.2.3
    const slash = key.lastIndexOf("/");
    if (slash > 0 && /^\d/.test(key.slice(slash + 1))) {
      out.push({ name: key.slice(0, slash), version: key.slice(slash + 1).replace(/_.*$/, "") });
    }
  }
  return dedupe(out);
}

// yarn.lock v1 (and berry's `version: x` form).
export function parseYarnLock(text: string): NameVersion[] {
  const out: NameVersion[] = [];
  let names: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw.startsWith("#")) continue;
    if (!raw.startsWith(" ")) {
      names = raw.replace(/:$/, "").split(/,\s*/).map((s) => s.trim().replace(/^"|"$/g, "")).map((spec) => {
        const at = spec.lastIndexOf("@");
        return at > 0 ? spec.slice(0, at) : spec;
      }).filter(Boolean);
      continue;
    }
    const m = raw.match(/^\s+version:?\s+"?([^"\s]+)"?/);
    if (m && names.length) {
      for (const name of new Set(names)) out.push({ name, version: m[1]! });
      names = [];
    }
  }
  return dedupe(out);
}

// `.nvmrc` / `.node-version`: first non-comment line, as written ("24", "lts/*", "v24.22.0").
export function parseNodeVersionFile(text: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (t && !t.startsWith("#")) return t.replace(/^v/, "");
  }
  return null;
}

// package.json#engines.node constraint, e.g. ">=24.22.1".
export function parseEnginesNode(text: string): string | null {
  try {
    const v = (JSON.parse(text) as { engines?: { node?: unknown } }).engines?.node;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}
