import type { Matcher } from "../finding";
import { matchRuntime } from "./shared";

// Node below the fixed release for its line: definite when installed or in an
// exact image tag, likely for exact .nvmrc pins and floating image tags.
// Lines with no release (20, 23, 25) are end-of-life: likely, move to the LTS fix.
export const matcher: Matcher = {
  advisoryId: "nodejs-2026-10-21",
  match(inv, advisory, config) {
    const fixed = (advisory.check.params as { fixed: Record<string, string> }).fixed;
    return matchRuntime(inv, advisory, config, {
      runtime: "node",
      belowVariant: "unsupported",
      belowConfidence: "likely",
      belowFixedTarget: fixed["24"] ?? Object.values(fixed)[0]!,
    });
  },
};
