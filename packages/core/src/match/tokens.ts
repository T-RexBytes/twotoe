// Risky-token extraction (SPEC 10.5). The matcher builds allowedTokens with
// this exact function and the validator checks model text with it, so both
// walls agree on what counts as a fact.

export const KNOWN_VENDORS = [
  "Node.js", "Node", "PHP", "Plex", "GitLab", "LiteLLM", "Railway", "OpenCode", "OpenAI",
  "Anthropic", "Google", "eMudhra", "SBI", "CISA",
];

// SPEC 10.5 says \d{4,}; any length is stricter, so an invented "CVE-2026-1" is caught too.
const CVE_RE = /CVE-\d{4}-\d+/gi;
const VERSION_RE = /\b\d+(?:\.\d+){1,3}\b/g;
const NUMBER_RE = /\b\d{2,}\b/g;
const VENDOR_RE = new RegExp(`\\b(?:${KNOWN_VENDORS.map((v) => v.replace(/\./g, "\\.")).join("|")})\\b`, "g");

export function extractRiskyTokens(text: string): string[] {
  const out = new Set<string>();
  for (const re of [CVE_RE, VERSION_RE, NUMBER_RE, VENDOR_RE]) {
    for (const m of text.matchAll(re)) out.add(m[0]);
  }
  return [...out];
}

export function normToken(t: string): string {
  return t.trim().toLowerCase();
}

// Every given string plus every risky token inside it, deduped (case-insensitive).
export function tokenUnion(strings: Array<string | undefined | null>): string[] {
  const seen = new Map<string, string>();
  for (const s of strings) {
    if (!s) continue;
    for (const t of [s, ...extractRiskyTokens(s)]) {
      const k = normToken(t);
      if (k && !seen.has(k)) seen.set(k, t);
    }
  }
  return [...seen.values()];
}
