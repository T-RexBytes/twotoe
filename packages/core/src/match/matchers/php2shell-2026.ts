import type { Matcher } from "../finding";
import { lowestFixed } from "../semverUtil";
import { matchRuntime } from "./shared";

// PHP below the fixed patch for its line: definite. 8.1 and older get no fix:
// still definite, with the "take it offline" wording CISA uses.
export const matcher: Matcher = {
  advisoryId: "php2shell-2026",
  match(inv, advisory, config) {
    const fixed = (advisory.check.params as { fixed: Record<string, string> }).fixed;
    return matchRuntime(inv, advisory, config, {
      runtime: "php",
      belowVariant: "offline",
      belowConfidence: "definite",
      belowFixedTarget: lowestFixed(fixed),
    });
  },
};
