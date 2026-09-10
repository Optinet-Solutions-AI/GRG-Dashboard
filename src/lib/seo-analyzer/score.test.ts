import { describe, it, expect } from "vitest";
import { scoreChecks } from "./score";
import type { Check } from "./checks";

const c = (status: Check["status"], weight = 1, id = `c${Math.random()}`): Check => ({
  id, group: "Basic SEO", label: "l", status, weight, detail: "d",
});

describe("scoreChecks", () => {
  it("counts a warning as half its weight", () => {
    const s = scoreChecks([c("passed"), c("warning"), c("failed"), c("passed")]);
    expect(s).toMatchObject({ passed: 2, warnings: 1, failed: 1, earned: 2.5, possible: 4 });
    expect(s.score).toBe(63);
  });

  it("respects weights so a critical miss hurts more than a cosmetic one", () => {
    const critical = scoreChecks([c("failed", 2), c("passed", 1), c("passed", 1)]);
    const cosmetic = scoreChecks([c("passed", 2), c("failed", 1), c("passed", 1)]);
    expect(critical.score).toBeLessThan(cosmetic.score);
  });

  it("excludes not-applicable checks from the denominator instead of gifting a pass", () => {
    const withNa = scoreChecks([c("passed"), c("not-applicable"), c("failed")]);
    expect(withNa).toMatchObject({ passed: 1, failed: 1, notApplicable: 1, possible: 2 });
    expect(withNa.score).toBe(50); // not 67, which is what counting n/a as a pass would give
  });

  it("scores a clean sheet 100 and a total miss 0", () => {
    expect(scoreChecks([c("passed"), c("passed", 2)]).score).toBe(100);
    expect(scoreChecks([c("failed"), c("failed", 2)]).score).toBe(0);
  });

  it("returns 0 rather than dividing by zero when everything is not-applicable", () => {
    expect(scoreChecks([c("not-applicable"), c("not-applicable")])).toMatchObject({ score: 0, possible: 0 });
  });
});
