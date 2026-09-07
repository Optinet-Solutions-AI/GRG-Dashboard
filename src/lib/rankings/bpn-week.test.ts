import { describe, it, expect } from "vitest";
import { normalizePosition, isoWeekMonday, buildWeek, sweepVerdict, parseCheckedAt, expectedPairsFrom, type BpnRow } from "./bpn-week";

const row = (keyword: string, country: string, position: number | null, checked_at: string): BpnRow => ({
  domain: "gulfrecoverygroup.com", keyword, country, language: "ar", position, checked_at,
});

describe("normalizePosition", () => {
  it("treats the API's 0 as not-ranking, not as position zero", () => {
    expect(normalizePosition(0)).toBeNull();
  });
  it("passes a real position through", () => {
    expect(normalizePosition(3)).toBe(3);
  });
  it("keeps null as null", () => {
    expect(normalizePosition(null)).toBeNull();
  });
});

describe("isoWeekMonday", () => {
  it("maps a Tuesday sweep back to that week's Monday", () => {
    expect(isoWeekMonday("2026-09-01")).toBe("2026-08-31");
  });
  it("maps a Monday to itself", () => {
    expect(isoWeekMonday("2026-08-24")).toBe("2026-08-24");
  });
  it("maps a Sunday back to the Monday six days earlier", () => {
    expect(isoWeekMonday("2026-08-30")).toBe("2026-08-24");
  });
});

describe("buildWeek", () => {
  it("keeps only checks inside the target week", () => {
    const b = buildWeek([
      row("kwA", "SA", 3, "2026-09-01 05:00:00"),
      row("kwB", "SA", 5, "2026-08-24 03:00:00"), // previous week — must be excluded
    ], "2026-08-31");
    expect(b.pairs).toEqual([{ keyword: "kwA", country: "SA", position: 3 }]);
    expect(b.checked).toBe(1);
  });

  it("takes the latest check when a pair was checked twice in the week", () => {
    const b = buildWeek([
      row("kwA", "SA", 40, "2026-08-31 01:00:00"),
      row("kwA", "SA", 4, "2026-09-02 09:00:00"),
    ], "2026-08-31");
    expect(b.pairs).toEqual([{ keyword: "kwA", country: "SA", position: 4 }]);
  });

  it("converts the API's 0 into a null position", () => {
    const b = buildWeek([row("kwA", "SA", 0, "2026-09-01 05:00:00")], "2026-08-31");
    expect(b.pairs[0].position).toBeNull();
    expect(b.ranked).toBe(0);
    expect(b.checked).toBe(1);
  });

  it("counts ranked separately from checked and reports coverage", () => {
    const b = buildWeek([
      row("kwA", "SA", 3, "2026-09-01 05:00:00"),
      row("kwB", "SA", 0, "2026-09-01 05:00:00"),
      row("kwC", "QA", 7, "2026-09-01 05:00:00"),
    ], "2026-08-31", 6);
    expect(b.checked).toBe(3);
    expect(b.ranked).toBe(2);
    expect(b.coverage).toBeCloseTo(0.5);
  });

  it("stamps the week it was asked for", () => {
    const b = buildWeek([row("kwA", "SA", 1, "2026-09-01 05:00:00")], "2026-08-31");
    expect(b.weekDate).toBe("2026-08-31");
  });
});

describe("sweepVerdict", () => {
  const build = (checked: number, ranked: number, coverage: number | null = null) =>
    ({ weekDate: "2026-08-31", pairs: [], checked, ranked, coverage });

  it("refuses a wholesale all-zero sweep when the previous week had rankings", () => {
    // This is exactly 2026-08-24: 135 pairs checked, every one zero.
    const v = sweepVerdict(build(135, 0), 67);
    expect(v.write).toBe(false);
    expect(v.reason).toMatch(/all-zero/i);
  });

  it("allows an all-zero week when nothing ranked the previous week either", () => {
    const v = sweepVerdict(build(135, 0), 0);
    expect(v.write).toBe(true);
  });

  it("allows an all-zero result from a trivially small sample", () => {
    const v = sweepVerdict(build(2, 0), 67);
    expect(v.write).toBe(true);
  });

  it("writes a thinly covered week but marks it partial", () => {
    const v = sweepVerdict(build(84, 13, 0.58), 67);
    expect(v.write).toBe(true);
    expect(v.partial).toBe(true);
  });

  it("does not mark a well-covered week partial", () => {
    const v = sweepVerdict(build(136, 73, 0.94), 67);
    expect(v.write).toBe(true);
    expect(v.partial).toBe(false);
  });

  it("refuses a week with nothing checked at all", () => {
    const v = sweepVerdict(build(0, 0), 67);
    expect(v.write).toBe(false);
    expect(v.reason).toMatch(/no checks/i);
  });
});

describe("parseCheckedAt (panel timestamps are UTC-4, not UTC)", () => {
  it("reads a bare timestamp as panel-local, so true UTC is 4h later", () => {
    // Verified against the API itself: meta.generated_at 2026-09-07T08:37:06Z arrived
    // alongside a just-written checked_at of "2026-09-07 04:36:21".
    expect(parseCheckedAt("2026-09-07 04:36:21")).toBe(Date.parse("2026-09-07T08:36:21Z"));
  });

  it("honours an explicit zone instead of shifting it again", () => {
    expect(parseCheckedAt("2026-09-01T05:00:00Z")).toBe(Date.parse("2026-09-01T05:00:00Z"));
  });

  it("puts a Sunday-evening panel check in the week it really belongs to", () => {
    // Panel "2026-09-06 21:00" is Monday 2026-09-07T01:00Z — the NEXT ISO week.
    const b = buildWeek([row("kwA", "SA", 3, "2026-09-06 21:00:00")], "2026-08-31");
    expect(b.checked).toBe(0);
    expect(buildWeek([row("kwA", "SA", 3, "2026-09-06 21:00:00")], "2026-09-07").checked).toBe(1);
  });

  it("still counts a check the panel stamps late on the closing Sunday", () => {
    // Panel "2026-08-30 21:00" is Monday 2026-08-31T01:00Z — inside week 2026-08-31.
    expect(buildWeek([row("kwA", "SA", 3, "2026-08-30 21:00:00")], "2026-08-31").checked).toBe(1);
  });
});

describe("expectedPairsFrom", () => {
  it("takes the fullest recent week, not the most recent one", () => {
    // Live case: 2026-08-31 stored only 89 rows because that sweep stopped early, so
    // measuring against it reported 127 imported pairs as "143% coverage".
    expect(expectedPairsFrom([89, 144, 144, 144])).toBe(144);
  });

  it("ignores weeks outside the lookback window", () => {
    expect(expectedPairsFrom([11, 89, 90, 91, 144], 4)).toBe(91);
  });

  it("has no baseline on a first-ever import", () => {
    expect(expectedPairsFrom([])).toBeUndefined();
  });

  it("skips empty weeks rather than treating them as a baseline of zero", () => {
    expect(expectedPairsFrom([0, 0, 144])).toBe(144);
  });

  it("keeps a thin week thin when every recent week was full", () => {
    const b = buildWeek([row("kwA", "SA", 3, "2026-09-08 05:00:00")], "2026-09-07", expectedPairsFrom([144, 144]));
    expect(b.coverage).toBeCloseTo(1 / 144);
    expect(sweepVerdict(b, 21).partial).toBe(true);
  });
});
