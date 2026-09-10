// Turn the check results into the four numbers the dashboard already stores for .com:
// a 0-100 score plus passed / warnings / failed counts.

import type { Check } from "./checks";

export type Scored = {
  score: number;
  passed: number;
  warnings: number;
  failed: number;
  notApplicable: number;
  earned: number;
  possible: number;
};

/**
 * A warning earns half its weight — it is a "could be better", not a miss, and treating
 * it as a failure made the score swing wildly on cosmetics.
 *
 * Not-applicable checks are excluded from the denominator entirely rather than counted as
 * passes: these pages ship zero <img> elements, and awarding marks for alt text nobody
 * needed would quietly inflate the score.
 */
export function scoreChecks(checks: Check[]): Scored {
  let earned = 0;
  let possible = 0;
  let passed = 0;
  let warnings = 0;
  let failed = 0;
  let notApplicable = 0;

  for (const c of checks) {
    if (c.status === "not-applicable") {
      notApplicable++;
      continue;
    }
    possible += c.weight;
    if (c.status === "passed") {
      earned += c.weight;
      passed++;
    } else if (c.status === "warning") {
      earned += c.weight / 2;
      warnings++;
    } else {
      failed++;
    }
  }

  return {
    score: possible === 0 ? 0 : Math.round((earned / possible) * 100),
    passed,
    warnings,
    failed,
    notApplicable,
    earned,
    possible,
  };
}
