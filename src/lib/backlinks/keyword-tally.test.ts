import { describe, it, expect } from "vitest";
import { tallyByKeyword } from "./keyword-tally";

const rows = (...anchors: (string | null)[]) => anchors.map((anchor_text) => ({ anchor_text }));

describe("tallyByKeyword", () => {
  it("counts the backlinks built for each keyword, busiest first", () => {
    expect(tallyByKeyword(rows("تجميد حساب التداول", "مشاكل سحب التداول", "تجميد حساب التداول"))).toEqual([
      { label: "تجميد حساب التداول", count: 2 },
      { label: "مشاكل سحب التداول", count: 1 },
    ]);
  });

  // The sheet is filled in by hand, so the same keyword arrives with a stray space or a
  // different case. Counting those as separate keywords would split one campaign in two.
  it("treats spacing and case differences as the same keyword", () => {
    expect(tallyByKeyword(rows("Fund Recovery", " fund   recovery ", "fund recovery"))).toEqual([
      { label: "Fund Recovery", count: 3 },
    ]);
  });

  it("shows the keyword as first spelled, not the normalised form", () => {
    expect(tallyByKeyword(rows("Fund Recovery", "fund recovery"))[0].label).toBe("Fund Recovery");
  });

  it("ignores rows with no keyword rather than counting a blank one", () => {
    expect(tallyByKeyword(rows("تجميد حساب التداول", null, "", "   "))).toEqual([
      { label: "تجميد حساب التداول", count: 1 },
    ]);
  });

  // Equal counts in a hash map come out in insertion order, which shifts as the sheet is
  // edited — the panel would reshuffle between refreshes for no visible reason.
  it("orders equal counts alphabetically so the panel is stable between refreshes", () => {
    expect(tallyByKeyword(rows("beta", "alpha", "gamma")).map((k) => k.label)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("returns nothing for no rows", () => {
    expect(tallyByKeyword([])).toEqual([]);
  });
});
