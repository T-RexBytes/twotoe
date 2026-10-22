import { z } from "zod";

// SPEC 10.1. What a writer (template or model) produces. Counts are not in
// here: code assembles line1 and line2 from the draft plus computed numbers.
export const BriefDraft = z.object({
  line1Actions: z.array(z.string()).max(2),
  line2Tail: z.string(),
  checklist: z.array(z.object({ findingId: z.string(), action: z.string(), why: z.string() })),
  fyi: z.array(z.string()),
});
export type BriefDraft = z.infer<typeof BriefDraft>;
