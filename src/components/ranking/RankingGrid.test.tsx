// src/components/ranking/RankingGrid.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RankingGrid } from "./RankingGrid";
import type { GridRow } from "@/lib/data/ranking";

const rows: GridRow[] = [
  { keyword: "استرداد", keyword_sort: 0, country: "AE", country_sort: 0, position: 3, prev_position: 5 },
];

describe("RankingGrid volumes", () => {
  it("renders GSV + per-country Rank/SV columns with their values", () => {
    render(
      <RankingGrid
        rows={rows}
        globalVolume={new Map([["استرداد", 12000]])}
        marketVolume={new Map([["استرداد|AE", 8100]])}
      />,
    );
    // Global column header + value
    expect(screen.getByText("GSV")).toBeTruthy();
    expect(screen.getByText("12,000")).toBeTruthy();
    // Each country is split into a Rank column and an SV column
    expect(screen.getByText("Rank")).toBeTruthy();
    expect(screen.getByText("SV")).toBeTruthy();
    // Per-country search volume shows in its own cell
    expect(screen.getByText("8,100")).toBeTruthy();
  });
  it("renders em dashes when no volume maps are provided", () => {
    render(<RankingGrid rows={rows} />);
    // GSV cell + SV cell both fall back to —
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});

describe("RankingGrid lost rankings", () => {
  it("flags a keyword that fell out of the top 100 in red with its previous position", () => {
    const lost: GridRow[] = [
      { keyword: "استرداد", keyword_sort: 0, country: "AE", country_sort: 0, position: null, prev_position: 4 },
    ];
    render(<RankingGrid rows={lost} />);
    expect(screen.getByText("↓ Lost")).toBeTruthy();
    expect(screen.getByText("was 4")).toBeTruthy();
  });

  it("leaves a never-ranked keyword muted with no loss flag", () => {
    const never: GridRow[] = [
      { keyword: "استرداد", keyword_sort: 0, country: "AE", country_sort: 0, position: null, prev_position: null },
    ];
    render(<RankingGrid rows={never} />);
    expect(screen.getByText("Not in top 100")).toBeTruthy();
    expect(screen.queryByText("↓ Lost")).toBeNull();
  });
});

describe("RankingGrid market grouping", () => {
  const MARKETS = ["SA", "QA", "AE"];
  // Two all-market keywords and one SA-only, with the SA-only sorted BETWEEN them so the
  // groups interleave in keyword order — the shape that used to repeat group headers.
  const full = (kw: string, sort: number) =>
    MARKETS.map((c, i) => ({
      keyword: kw, keyword_sort: sort, country: c, country_sort: i, position: 5, prev_position: 5,
    }));
  const rows: GridRow[] = [
    ...full("all-one", 0),
    { keyword: "sa-only", keyword_sort: 1, country: "SA", country_sort: 0, position: 2, prev_position: 2 },
    ...full("all-two", 2),
  ];

  it("emits each market group header exactly once even when groups interleave", () => {
    render(<RankingGrid rows={rows} />);
    expect(screen.getAllByText(/All markets/).length).toBe(1);
    expect(screen.getAllByText(/Saudi|SA/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/· 2 keywords/)).toBeTruthy();
  });

  it("keeps a keyword in All markets when a market is merely missing from the week", () => {
    // "all-two" lost its QA row (a sweep failure), which previously demoted it to
    // "Selected markets" and split the All-markets block in two.
    const holed = rows.filter((r) => !(r.keyword === "all-two" && r.country === "QA"));
    const tracked = new Map([
      ["all-one", MARKETS], ["all-two", MARKETS], ["sa-only", ["SA"]],
    ]);
    render(<RankingGrid rows={holed} trackedMarkets={tracked} />);
    expect(screen.getAllByText(/All markets/).length).toBe(1);
    expect(screen.getByText(/· 2 keywords/)).toBeTruthy();
    // and the hole reads as missing data, not as "not tracked here"
    expect(screen.getByTitle(/didn't complete this keyword in this market/)).toBeTruthy();
  });

  it("still mutes a market the keyword genuinely does not target", () => {
    render(<RankingGrid rows={rows} />);
    expect(screen.getAllByTitle("Not tracked in this market").length).toBe(2); // sa-only: QA + AE
  });
});
