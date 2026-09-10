import { describe, it, expect } from "vitest";
import { shouldRunSeoAnalysis } from "./cadence";

// The rhythm is the 1st and the 16th, but the question asked is "does this cycle have a
// score yet?" — so a day that couldn't run is picked up by the next one rather than
// costing the site half a month. Cycle mechanics are covered in lib/schedule/cycle.test.ts.
describe("shouldRunSeoAnalysis", () => {
  it("runs on the 1st and the 16th", () => {
    expect(shouldRunSeoAnalysis({ today: "2026-10-01", lastRun: "2026-09-16" }).due).toBe(true);
    expect(shouldRunSeoAnalysis({ today: "2026-09-16", lastRun: "2026-09-01" }).due).toBe(true);
  });

  it("stays quiet for the rest of the cycle once a score is stored", () => {
    const d = shouldRunSeoAnalysis({ today: "2026-09-20", lastRun: "2026-09-16" });
    expect(d.due).toBe(false);
    expect(d.reason).toMatch(/already captured/);
  });

  it("runs when nothing has ever been stored", () => {
    expect(shouldRunSeoAnalysis({ today: "2026-09-11", lastRun: null }).due).toBe(true);
  });

  it("does not run twice on the same anchor day", () => {
    // The cron fires daily, so the 16th must not overwrite its own row on a later pass.
    const d = shouldRunSeoAnalysis({ today: "2026-09-16", lastRun: "2026-09-16" });
    expect(d.due).toBe(false);
  });

  it("catches up the day after a missed anchor, and keeps trying", () => {
    expect(shouldRunSeoAnalysis({ today: "2026-09-17", lastRun: "2026-09-01" }).due).toBe(true);
    expect(shouldRunSeoAnalysis({ today: "2026-09-19", lastRun: "2026-09-01" }).due).toBe(true);
    // …then goes quiet the moment it lands.
    expect(shouldRunSeoAnalysis({ today: "2026-09-19", lastRun: "2026-09-19" }).due).toBe(false);
  });

  it("counts by cycle, not by elapsed days", () => {
    // 14 days old but the current cycle (from the 1st) is already covered → not due.
    expect(shouldRunSeoAnalysis({ today: "2026-09-14", lastRun: "2026-09-02" }).due).toBe(false);
    // 4 days old but it belongs to the previous cycle → due.
    expect(shouldRunSeoAnalysis({ today: "2026-09-16", lastRun: "2026-09-12" }).due).toBe(true);
  });

  it("accepts a caller-supplied rhythm", () => {
    expect(shouldRunSeoAnalysis({ today: "2026-09-08", lastRun: "2026-09-01", anchorDays: [8] }).due).toBe(true);
  });
});
