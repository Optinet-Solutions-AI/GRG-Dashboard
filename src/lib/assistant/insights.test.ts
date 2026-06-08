import { describe, it, expect } from "vitest";
import { topRankingMover, staleSections, trendDirection } from "./insights";

describe("topRankingMover", () => {
  it("picks the site with the largest net of improved keyword positions", () => {
    const rows = [
      { site: "A", position: 5, prevPosition: 9 },   // improved (+1)
      { site: "A", position: 12, prevPosition: 8 },  // worse (-1)  => A net 0
      { site: "B", position: 3, prevPosition: 7 },   // improved (+1)
      { site: "B", position: 2, prevPosition: 6 },   // improved (+1) => B net 2
    ];
    expect(topRankingMover(rows)).toEqual({ site: "B", net: 2 });
  });
  it("ignores rows with a null position on either side", () => {
    const rows = [
      { site: "A", position: null, prevPosition: 5 },
      { site: "A", position: 4, prevPosition: null },
    ];
    expect(topRankingMover(rows)).toBeNull();
  });
});

describe("staleSections", () => {
  it("flags sections with no data or older than the threshold", () => {
    const rows = [
      { section: "SEO", latest: "2026-06-07" },     // 1 day old -> fresh
      { section: "Health", latest: null },          // missing -> stale
      { section: "Backlinks", latest: "2026-05-01" }, // old -> stale
    ];
    expect(staleSections(rows, "2026-06-08", 14)).toEqual(["Health", "Backlinks"]);
  });
});

describe("trendDirection", () => {
  it("compares the two most recent periods", () => {
    const pts = [
      { date: "2026-05-01", score: 80 },
      { date: "2026-06-01", score: 88 },
    ];
    expect(trendDirection(pts)).toEqual({ dir: "up", delta: 8 });
  });
  it("returns n/a with fewer than two valid points", () => {
    expect(trendDirection([{ date: "2026-06-01", score: 88 }])).toEqual({ dir: "n/a", delta: null });
  });
});
