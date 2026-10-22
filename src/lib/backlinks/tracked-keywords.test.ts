import { describe, it, expect } from "vitest";
import { trackedKeywordSet, filterToTrackedKeywords } from "./tracked-keywords";

const rows = (...anchors: (string | null)[]) => anchors.map((anchor_text) => ({ anchor_text }));

describe("trackedKeywordSet", () => {
  it("takes the keyword text out of the site's rank-tracking targets", () => {
    const set = trackedKeywordSet([{ keywords: { text: "تجميد حساب التداول" } }, { keywords: { text: "مشاكل سحب التداول" } }]);
    expect(set.size).toBe(2);
  });

  // One keyword is targeted in several markets, so the sheet lists it once per market.
  it("counts a keyword targeted in six markets once", () => {
    const set = trackedKeywordSet([
      { keywords: { text: "تجميد حساب التداول" } },
      { keywords: { text: "تجميد حساب التداول" } },
      { keywords: { text: "تجميد حساب التداول" } },
    ]);
    expect(set.size).toBe(1);
  });

  it("survives a target row whose keyword did not join", () => {
    expect(trackedKeywordSet([{ keywords: null }, { keywords: { text: "" } }]).size).toBe(0);
  });
});

describe("filterToTrackedKeywords", () => {
  const roster = trackedKeywordSet([{ keywords: { text: "تجميد حساب التداول" } }, { keywords: { text: "Fund Recovery" } }]);

  it("keeps only the links built for a keyword the site is tracked for", () => {
    const kept = filterToTrackedKeywords(
      rows("تجميد حساب التداول", "كيف أبلغ عن موقع تداول نصاب", "Fund Recovery"),
      roster,
    );
    expect(kept.map((r) => r.anchor_text)).toEqual(["تجميد حساب التداول", "Fund Recovery"]);
  });

  // Matching has to forgive what the tally forgives, or a link counted under a keyword in the
  // panel would vanish from the same page's tracked view.
  it("matches regardless of spacing and case, as the keyword panel does", () => {
    expect(filterToTrackedKeywords(rows(" fund   recovery "), roster)).toHaveLength(1);
  });

  it("keeps nothing when the site has no roster", () => {
    expect(filterToTrackedKeywords(rows("تجميد حساب التداول"), new Set())).toEqual([]);
  });

  it("drops a link with no keyword at all", () => {
    expect(filterToTrackedKeywords(rows(null, ""), roster)).toEqual([]);
  });
});
