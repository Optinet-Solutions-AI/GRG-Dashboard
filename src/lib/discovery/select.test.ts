import { describe, it, expect } from "vitest";
import { cycleOf, toDiscoveryRows, withoutTracked, markNew } from "./select";

const apiRow = (over: Record<string, unknown> = {}) => ({
  keyword: "استرجاع اموال من شركة نصابة",
  keyword_country: "SA",
  best_position: 7,
  best_position_url: "https://gulfrecoverygroup.com/ar/x",
  volume: 300,
  ...over,
});

describe("cycleOf", () => {
  // A cycle is a month, so "last month's list" — which decides NEW — is a date comparison.
  it("files a pull under the first of its month", () => {
    expect(cycleOf(new Date("2026-11-20T12:00:00Z"))).toBe("2026-11-01");
    expect(cycleOf(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12-01");
  });
});

describe("toDiscoveryRows", () => {
  it("keeps the keyword, market, position, page and volume", () => {
    expect(toDiscoveryRows([apiRow()])).toEqual([
      { keyword: "استرجاع اموال من شركة نصابة", countryCode: "SA", position: 7, url: "https://gulfrecoverygroup.com/ar/x", volume: 300 },
    ]);
  });

  it("upper-cases the market, which our countries table is keyed on", () => {
    expect(toDiscoveryRows([apiRow({ keyword_country: "ae" })])[0].countryCode).toBe("AE");
  });

  // A row with no position is not a discovery: it is Ahrefs saying it saw nothing.
  it("drops rows with no keyword, no market or no position", () => {
    expect(toDiscoveryRows([apiRow({ keyword: "" }), apiRow({ keyword_country: null }), apiRow({ best_position: null })])).toEqual([]);
  });

  it("survives a missing volume rather than inventing one", () => {
    expect(toDiscoveryRows([apiRow({ volume: null })])[0].volume).toBeNull();
  });
});

describe("withoutTracked", () => {
  const rows = toDiscoveryRows([apiRow({ keyword: "tracked one" }), apiRow({ keyword: "untracked one" })]);

  it("drops a keyword the site already tracks — the list is what we are NOT watching", () => {
    const kept = withoutTracked(rows, new Set(["tracked one"]));
    expect(kept.map((r) => r.keyword)).toEqual(["untracked one"]);
  });

  // The tracked list and Ahrefs are typed by different people at different times.
  it("matches a tracked keyword despite spacing and case", () => {
    const kept = withoutTracked(toDiscoveryRows([apiRow({ keyword: " Tracked   One " })]), new Set(["tracked one"]));
    expect(kept).toEqual([]);
  });
});

describe("markNew", () => {
  const rows = toDiscoveryRows([apiRow({ keyword: "a" }), apiRow({ keyword: "b" })]);

  it("marks a keyword that was not in last month's list", () => {
    const marked = markNew(rows, new Set(["a|SA"]), { previousCycleComplete: true });
    expect(marked.map((r) => [r.keyword, r.isNew])).toEqual([["a", false], ["b", true]]);
  });

  /**
   * A false NEW is worse than no NEW: it tells the client we have just started ranking for
   * something we have ranked for all along. If last month's pull did not finish, its list is
   * not evidence of absence, so nothing is marked.
   */
  it("marks nothing when last month's list was cut short", () => {
    const marked = markNew(rows, new Set(["a|SA"]), { previousCycleComplete: false });
    expect(marked.every((r) => r.isNew === false)).toBe(true);
  });

  it("marks nothing when there is no previous month at all", () => {
    const marked = markNew(rows, new Set(), { previousCycleComplete: false });
    expect(marked.every((r) => r.isNew === false)).toBe(true);
  });

  it("treats the same keyword in a different market as its own entry", () => {
    const two = toDiscoveryRows([apiRow({ keyword: "a" }), apiRow({ keyword: "a", keyword_country: "AE" })]);
    const marked = markNew(two, new Set(["a|SA"]), { previousCycleComplete: true });
    expect(marked.map((r) => [r.countryCode, r.isNew])).toEqual([["SA", false], ["AE", true]]);
  });
});
