import { describe, it, expect } from "vitest";
import { shouldRunSeoAnalysis, MAX_GAP_DAYS } from "./cadence";

describe("shouldRunSeoAnalysis", () => {
  it("runs on the 1st and the 16th", () => {
    expect(shouldRunSeoAnalysis({ today: "2026-10-01", lastRun: "2026-09-16" }).due).toBe(true);
    expect(shouldRunSeoAnalysis({ today: "2026-09-16", lastRun: "2026-09-01" }).due).toBe(true);
  });

  it("stays quiet on every other day", () => {
    const d = shouldRunSeoAnalysis({ today: "2026-09-20", lastRun: "2026-09-16" });
    expect(d.due).toBe(false);
    expect(d.reason).toMatch(/not due/);
  });

  it("runs when nothing has ever been stored", () => {
    expect(shouldRunSeoAnalysis({ today: "2026-09-11", lastRun: null }).due).toBe(true);
  });

  it("does not run twice on the same anchor day", () => {
    // The cron fires daily, so the 16th must not overwrite its own row on a second pass.
    const d = shouldRunSeoAnalysis({ today: "2026-09-16", lastRun: "2026-09-16" });
    expect(d.due).toBe(false);
    expect(d.reason).toMatch(/already scored today/);
  });

  it("catches up when a scheduled day was missed", () => {
    // Hobby crons drift and can skip a day; a fixed-day-only rule would then wait out the
    // rest of the half-month.
    const d = shouldRunSeoAnalysis({ today: "2026-09-18", lastRun: "2026-09-01" });
    expect(d.due).toBe(true);
    expect(d.reason).toMatch(/past the 15-day limit/);
  });

  it("holds off one day short of the limit and fires the day after", () => {
    const justUnder = shouldRunSeoAnalysis({ today: "2026-09-14", lastRun: "2026-08-31" }); // 14 days
    const atLimit = shouldRunSeoAnalysis({ today: "2026-09-15", lastRun: "2026-08-31" }); // 15 days
    expect(justUnder.due).toBe(false);
    expect(atLimit.due).toBe(true);
    expect(MAX_GAP_DAYS).toBe(15);
  });

  it("counts across a month boundary rather than comparing day numbers", () => {
    const d = shouldRunSeoAnalysis({ today: "2026-10-05", lastRun: "2026-09-16" }); // 19 days
    expect(d.due).toBe(true);
  });

  it("accepts a caller-supplied rhythm", () => {
    expect(shouldRunSeoAnalysis({ today: "2026-09-08", lastRun: "2026-09-01", anchorDays: [8] }).due).toBe(true);
  });
});
