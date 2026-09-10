import { describe, it, expect } from "vitest";
import { cycleStart, isDueThisCycle } from "./cycle";

describe("cycleStart", () => {
  it("maps a day inside the first half of the month back to the 1st", () => {
    expect(cycleStart("2026-09-01")).toBe("2026-09-01");
    expect(cycleStart("2026-09-10")).toBe("2026-09-01");
    expect(cycleStart("2026-09-15")).toBe("2026-09-01");
  });

  it("maps a day from the 16th onward back to the 16th", () => {
    expect(cycleStart("2026-09-16")).toBe("2026-09-16");
    expect(cycleStart("2026-09-30")).toBe("2026-09-16");
  });

  it("crosses a month boundary when the anchors don't include day 1", () => {
    // With anchors [5, 20], the 3rd of September still belongs to August's 20th cycle.
    expect(cycleStart("2026-09-03", [5, 20])).toBe("2026-08-20");
  });

  it("crosses a year boundary", () => {
    expect(cycleStart("2026-01-03", [5, 20])).toBe("2025-12-20");
  });
});

describe("isDueThisCycle", () => {
  it("is due when nothing has ever been stored", () => {
    expect(isDueThisCycle({ today: "2026-09-10", lastRun: null }).due).toBe(true);
  });

  it("is not due once this cycle already has a snapshot", () => {
    const d = isDueThisCycle({ today: "2026-09-20", lastRun: "2026-09-16" });
    expect(d.due).toBe(false);
    expect(d.reason).toMatch(/already captured on 2026-09-16/);
  });

  it("keeps retrying on the days after a missed anchor, instead of losing the cycle", () => {
    // This is the whole point: the 16th couldn't run, so the 17th and 18th pick it up
    // rather than the site waiting out the half-month.
    for (const today of ["2026-09-17", "2026-09-18", "2026-09-25"]) {
      const d = isDueThisCycle({ today, lastRun: "2026-09-01" });
      expect(d.due).toBe(true);
      expect(d.reason).toMatch(/no snapshot yet for the cycle beginning 2026-09-16/);
    }
  });

  it("goes quiet as soon as the late snapshot lands", () => {
    expect(isDueThisCycle({ today: "2026-09-18", lastRun: "2026-09-18" }).due).toBe(false);
  });

  it("becomes due again at the next anchor", () => {
    expect(isDueThisCycle({ today: "2026-09-15", lastRun: "2026-09-02" }).due).toBe(false);
    expect(isDueThisCycle({ today: "2026-09-16", lastRun: "2026-09-02" }).due).toBe(true);
  });

  it("treats a snapshot taken mid-cycle as covering that cycle", () => {
    // A manual run on the 10th satisfies the cycle that began on the 1st.
    expect(isDueThisCycle({ today: "2026-09-12", lastRun: "2026-09-10" }).due).toBe(false);
    expect(isDueThisCycle({ today: "2026-10-01", lastRun: "2026-09-10" }).due).toBe(true);
  });
});
