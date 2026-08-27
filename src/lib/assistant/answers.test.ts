import { describe, it, expect } from "vitest";
import { rankingAnswer, type GridRow } from "./answers";
import type { ParsedQuery } from "./nlu";

const q = (over: Partial<ParsedQuery> = {}): ParsedQuery => ({
  topics: ["ranking"], country: null, keyword: null, direction: null, extreme: null,
  comparison: false, count: false, greeting: false, filter: null, threshold: null,
  list: false, url: null, notRanking: false, ...over,
});

describe("rankingAnswer — keywords that fell out of the top 100", () => {
  const rows: GridRow[] = [
    { keyword: "استرداد", country: "AE", position: null, prev_position: 4 },   // lost
    { keyword: "تداول", country: "SA", position: 30, prev_position: 12 },      // slipped
  ];

  it("counts a fall-out as a drop and names it in the 'what dropped' list", () => {
    const out = rankingAnswer(q({ direction: "down" }), "2026-08-24", "2026-08-17", rows);
    expect(out).toContain("2 keywords dropped");
    expect(out).toContain("استرداد");
    expect(out).toContain("4→out of top 100");
  });

  it("worst drop is the fall-out, not the in-range slip", () => {
    const out = rankingAnswer(q({ direction: "down" }), "2026-08-24", "2026-08-17", rows);
    expect(out.indexOf("استرداد")).toBeLessThan(out.indexOf("تداول"));
  });

  it("a single-keyword lookup says it fell out and from where", () => {
    const out = rankingAnswer(q({ keyword: "استرداد" }), "2026-08-24", "2026-08-17", rows);
    expect(out).toContain("not ranking");
    expect(out).toContain("↓ fell out of top 100, was #4");
  });
});
