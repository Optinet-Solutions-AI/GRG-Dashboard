import { describe, it, expect } from "vitest";
import { markStaleComparisons, shortWeek } from "./week-compare";
import type { GridRow } from "@/lib/data/ranking";

const row = (over: Partial<GridRow> = {}): GridRow => ({
  keyword: "تجميد حساب التداول",
  keyword_sort: 0,
  country: "SA",
  country_sort: 0,
  position: null,
  prev_position: null,
  prev_week: null,
  ...over,
});

describe("markStaleComparisons", () => {
  // The real case: Saudi was not returned by the check in the week of 2026-10-02, so the
  // database's previous position for 10-13 reaches back to 09-21 and "was 31" read as if the
  // keyword had been ranked the week before.
  it("marks a comparison whose previous position skips the preceding week", () => {
    const weeks = [
      { week: "2026-10-13", rows: [row({ prev_position: 31, prev_week: "2026-09-21" })] },
      { week: "2026-10-02", rows: [] },
      { week: "2026-09-21", rows: [row({ position: 31 })] },
    ];
    expect(markStaleComparisons(weeks)[0].rows[0].prev_stale).toBe(true);
  });

  it("leaves a true week-over-week comparison alone", () => {
    const weeks = [
      { week: "2026-10-13", rows: [row({ prev_position: 31, prev_week: "2026-10-02" })] },
      { week: "2026-10-02", rows: [row({ position: 31 })] },
    ];
    expect(markStaleComparisons(weeks)[0].rows[0].prev_stale).toBe(false);
  });

  // A pair checked last week and genuinely out of the top 100 has prev_position null. There is
  // no stale number to warn about, and the cell must stay the plain "Not in top 100".
  it("does not mark a pair that was checked last week and simply did not rank", () => {
    const weeks = [
      { week: "2026-10-13", rows: [row({ prev_position: null, prev_week: "2026-10-02" })] },
      { week: "2026-10-02", rows: [row({ position: null })] },
    ];
    expect(markStaleComparisons(weeks)[0].rows[0].prev_stale).toBe(false);
  });

  // The oldest week on the page has no predecessor to be measured against, so its comparison
  // reaches outside the window by definition — flagging it would warn about every bottom row.
  it("never marks the oldest week on the page", () => {
    const weeks = [{ week: "2026-06-02", rows: [row({ prev_position: 8, prev_week: "2026-05-26" })] }];
    expect(markStaleComparisons(weeks)[0].rows[0].prev_stale).toBe(false);
  });

  it("does not mark a keyword ranking for the first time", () => {
    const weeks = [
      { week: "2026-10-13", rows: [row({ position: 12, prev_position: null, prev_week: null })] },
      { week: "2026-10-02", rows: [] },
    ];
    expect(markStaleComparisons(weeks)[0].rows[0].prev_stale).toBe(false);
  });
});

describe("shortWeek", () => {
  it("shortens a week date to something that fits in a grid cell", () => {
    expect(shortWeek("2026-09-21")).toBe("21 Sep");
  });
});
