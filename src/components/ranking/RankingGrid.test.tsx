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
    expect(screen.getByText("Not checked")).toBeTruthy();
    expect(screen.getByTitle(/didn't complete this keyword in this market/)).toBeTruthy();
  });

  it("still mutes a market the keyword genuinely does not target", () => {
    render(<RankingGrid rows={rows} />);
    expect(screen.getAllByTitle("Not tracked in this market").length).toBe(2); // sa-only: QA + AE
  });
});

describe("RankingGrid movement labels", () => {
  const cell = (position: number | null, prev: number | null): GridRow[] => [
    { keyword: "kw", keyword_sort: 0, country: "BH", country_sort: 0, position, prev_position: prev },
  ];

  it("parenthesises the previous position so a 1-place gain can't read as 33 places", () => {
    // Live case: BH went #33 -> #32, which rendered as the ambiguous "32 ↑ 33".
    render(<RankingGrid rows={cell(32, 33)} />);
    expect(screen.getByText("32")).toBeTruthy();
    expect(screen.getByText("↑ (33)")).toBeTruthy();
    expect(screen.getByTitle("Improved to #32 from #33 last week")).toBeTruthy();
  });

  it("does the same for a drop", () => {
    render(<RankingGrid rows={cell(40, 12)} />);
    expect(screen.getByText("↓ (12)")).toBeTruthy();
    expect(screen.getByTitle("Dropped to #40 from #12 last week")).toBeTruthy();
  });

  it("shows no movement marker when the position held", () => {
    render(<RankingGrid rows={cell(7, 7)} />);
    expect(screen.queryByText(/[↑↓]/)).toBeNull();
  });

  it("labels a first-time ranking as new", () => {
    render(<RankingGrid rows={cell(9, null)} />);
    expect(screen.getByText("↑ new")).toBeTruthy();
  });
})

describe("RankingGrid missing checks read as text, not punctuation", () => {
  // A market only gets a column if SOME row in the week has it, so a second keyword
  // holds the QA column open while the keyword under test is missing its QA check.
  const rows: GridRow[] = [
    { keyword: "kw", keyword_sort: 0, country: "SA", country_sort: 0, position: null, prev_position: null },
    { keyword: "other", keyword_sort: 1, country: "SA", country_sort: 0, position: 4, prev_position: 4 },
    { keyword: "other", keyword_sort: 1, country: "QA", country_sort: 1, position: 9, prev_position: 9 },
  ];
  const tracked = new Map([["kw", ["SA", "QA"]], ["other", ["SA", "QA"]]]);

  it("says 'Not checked' rather than a dash a reader mistakes for an empty cell", () => {
    render(<RankingGrid rows={rows} trackedMarkets={tracked} />);
    expect(screen.getByText("Not checked")).toBeTruthy();
    expect(screen.queryByText("–")).toBeNull();
  });

  it("keeps it distinct from a market that was checked and simply isn't ranking", () => {
    render(<RankingGrid rows={rows} trackedMarkets={tracked} />);
    expect(screen.getByText("Not in top 100")).toBeTruthy(); // kw in SA: checked, unranked
    expect(screen.getByText("Not checked")).toBeTruthy();    // kw in QA: never checked
  });

  it("drops a market from the week entirely when nothing in it was checked", () => {
    // OM is tracked but has no row anywhere this week -> no column, so no phantom cells.
    const t2 = new Map([["kw", ["SA", "QA", "OM"]], ["other", ["SA", "QA", "OM"]]]);
    render(<RankingGrid rows={rows} trackedMarkets={t2} />);
    expect(screen.queryByText(/Oman|OM/)).toBeNull();
    expect(screen.getAllByText("Not checked").length).toBe(1); // QA only, not OM
  });
});
