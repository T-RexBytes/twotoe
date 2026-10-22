// Allowed-token extraction is shared with the matcher (core builds
// allowedTokens with the same extractor), so both walls agree.
export { extractRiskyTokens, KNOWN_VENDORS, normToken } from "@twotoe/core";

// SPEC 10.2 rule 4.
export const HYPE_WORDS = ["critical", "urgent", "devastating", "catastrophic", "broke", "nightmare", "actively", "exploited"] as const;

export function hypeWordsIn(text: string): string[] {
  const found: string[] = [];
  for (const w of HYPE_WORDS) if (new RegExp(`\\b${w}\\b`, "i").test(text)) found.push(w);
  return found;
}
