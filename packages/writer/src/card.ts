import type { AdvisoryPack, Brief, Finding } from "@twotoe/core";

// What the morning card renders (SPEC 13): the brief plus what it needs to
// show evidence rows, confidence chips and vendor links. Built by node code
// (`twotoe card`, the example generator); the browser only imports the type.

export interface CardAdvisory {
  id: string;
  title: string;
  vendor: string;
  sourceUrls: string[];
  verifiedAt: string;
}

export interface CardAttempt {
  attempt: number;
  wallMs: number;
  evalCount?: number;
  promptEvalCount?: number;
  reasons: string[];
}

export interface CardData {
  source: "local" | "example";
  label: string;              // "Your brief", "Kitchen sink (fixture f22)"
  brief: Brief;
  findings: Finding[];
  advisories: CardAdvisory[];
  attempts: CardAttempt[];    // empty in template mode
  promptVersion: string | null;
  checksRun: number | null;
}

export function buildCardData(input: {
  source: CardData["source"];
  label: string;
  brief: Brief;
  findings: Finding[];
  pack: AdvisoryPack;
  attempts?: CardAttempt[];
  promptVersion?: string | null;
  checksRun?: number | null;
}): CardData {
  const used = new Set(input.findings.map((f) => f.advisoryId));
  return {
    source: input.source,
    label: input.label,
    brief: input.brief,
    findings: input.findings,
    advisories: input.pack.advisories
      .filter((a) => used.has(a.id))
      .map(({ id, title, vendor, sourceUrls, verifiedAt }) => ({ id, title, vendor, sourceUrls, verifiedAt })),
    attempts: input.attempts ?? [],
    promptVersion: input.promptVersion ?? null,
    checksRun: input.checksRun ?? null,
  };
}
