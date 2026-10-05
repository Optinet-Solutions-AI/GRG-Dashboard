// src/components/ranking/RankingGrid.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RankingGrid } from "./RankingGrid";
import type { GridRow } from "@/lib/data/ranking";

const rows: GridRow[] = [
  { keyword: "استرداد", keyword_sort: 0, country: "AE", country_sort: 0, position: 3, prev_position: 5 },
];

describe("RankingGrid volumes", () => {
  it("renders GSV, and gives each market a single column", () => {
    render(<RankingGrid rows={rows} globalVolume={new Map([["استرداد", 12000]])} />);
    expect(screen.getByText("GSV")).toBeTruthy();
    expect(screen.getByText("12,000")).toBeTruthy();
    // The per-market SV sub-column is gone: it repeated the same placeholder beside every
    // rank and doubled the table's width, and the header already names the market.
    expect(screen.queryByText("Rank")).toBeNull();
    expect(screen.queryByText("SV")).toBeNull();
  });

  it("names each market in full rather than printing its country code", () => {
    render(<RankingGrid rows={rows} />);
    expect(screen.getByText(/United Arab Emirates/)).toBeTruthy();
  });

  it("drops the English column from the Arabic grid", () => {
    render(<RankingGrid rows={rows} />);
    expect(screen.queryByText("English")).toBeNull();
  });
  it("renders an em dash for a keyword with no global volume", () => {
    render(<RankingGrid rows={rows} />);
    // GSV cell + SV cell both fall back to —
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
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
    expect(screen.getAllByText("Not in top 100").length).toBeGreaterThan(0);
    // The hole is still identifiable as missing data rather than a confirmed miss.
    expect(screen.getAllByTitle(/hasn't been returned by a check yet/).length).toBeGreaterThan(0);
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

describe("RankingGrid — a pair with no result reads as a miss, but stays recoverable", () => {
  const tracked = new Map([["kw", ["SA", "QA"]]]);
  const roster = { keywords: ["kw"], countries: ["SA", "QA"] };
  const rows: GridRow[] = [
    { keyword: "kw", keyword_sort: 0, country: "SA", country_sort: 0, position: null, prev_position: null },
  ];
  const text = () => document.body.textContent ?? "";

  it("reads 'Not in top 100', the same as a market that was checked and does not rank", () => {
    // The outcome for the reader is identical — it isn't ranking — so the table says so
    // rather than exposing our bookkeeping in every cell.
    render(<RankingGrid rows={rows} roster={roster} trackedMarkets={tracked} />);
    expect(screen.getAllByText("Not in top 100")).toHaveLength(2);
    expect(screen.queryByText("Not checked")).toBeNull();
  });

  it("still counts the outstanding pairs, so a gap in coverage is never silent", () => {
    render(<RankingGrid rows={rows} roster={roster} trackedMarkets={tracked} />);
    // kw/QA never came back; kw/SA did and simply does not rank.
    expect(text()).toMatch(/have not been returned by a check yet/);
    expect(text()).toMatch(/1 of 2 keyword\/market pairs/);
  });

  it("says nothing about outstanding pairs when every one has a result", () => {
    const full: GridRow[] = [
      { keyword: "kw", keyword_sort: 0, country: "SA", country_sort: 0, position: 5, prev_position: null },
      { keyword: "kw", keyword_sort: 0, country: "QA", country_sort: 1, position: null, prev_position: null },
    ];
    render(<RankingGrid rows={full} roster={roster} trackedMarkets={tracked} />);
    expect(text()).not.toMatch(/have not been returned/);
  });
});

describe("RankingGrid roster — every tracked keyword holds its place", () => {
  const SITES = ["SA", "QA"];
  // Only ONE keyword came back this week; the other two were tracked but skipped.
  const rows: GridRow[] = [
    { keyword: "kw-a", keyword_sort: 0, country: "SA", country_sort: 0, position: 4, prev_position: 4 },
  ];
  const roster = { keywords: ["kw-a", "kw-b", "kw-c"], countries: SITES };
  const tracked = new Map([["kw-a", SITES], ["kw-b", SITES], ["kw-c", SITES]]);

  it("renders the skipped keywords instead of dropping them from the week", () => {
    // The live bug: country blocks showed 7, 6 and 9 keywords instead of the 12 tracked.
    render(<RankingGrid rows={rows} roster={roster} trackedMarkets={tracked} />);
    for (const kw of ["kw-a", "kw-b", "kw-c"]) expect(screen.getByText(kw)).toBeTruthy();
    expect(screen.getByText(/· 3 keywords/)).toBeTruthy();
  });

  it("shows the skipped ones as not ranking, and counts them as outstanding", () => {
    render(<RankingGrid rows={rows} roster={roster} trackedMarkets={tracked} />);
    // kw-a/SA has a real position; the other five cells are missing data.
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getAllByText("Not in top 100")).toHaveLength(5);
    expect(screen.queryByText("Not checked")).toBeNull();
  });

  it("keeps every market column even when a market returned nothing at all", () => {
    render(<RankingGrid rows={rows} roster={roster} trackedMarkets={tracked} />);
    expect(screen.getAllByText(/Qatar|QA/).length).toBeGreaterThan(0);
  });

  it("still works without a roster, deriving the week from its own rows", () => {
    render(<RankingGrid rows={rows} trackedMarkets={new Map([["kw-a", ["SA"]]])} />);
    expect(screen.getByText("kw-a")).toBeTruthy();
    expect(screen.queryByText("kw-b")).toBeNull();
  });
});

describe("RankingGrid groups — the sheet decides the shape, not the data that came back", () => {
  const countries = ["SA", "AE", "KW"];
  const groups = [
    { code: "ALL", keywords: ["cross-1", "cross-2"] },
    { code: "SA", keywords: ["sa-only", "shared"] },
    { code: "KW", keywords: ["shared"] },
  ];
  const roster = { keywords: [], countries };

  it("draws every block the sheet defines, even with no data at all", () => {
    // .org: 98 keywords checked, none ranked, so nothing was stored — the table must still
    // show its shape rather than collapsing.
    render(<RankingGrid rows={[]} roster={roster} groups={groups} />);
    expect(screen.getByText("cross-1")).toBeTruthy();
    expect(screen.getByText("sa-only")).toBeTruthy();
  });

  it("lets one keyword appear under several markets, which inference cannot express", () => {
    render(<RankingGrid rows={[]} roster={roster} groups={groups} />);
    // "shared" is in both the SA and KW columns of the sheet.
    expect(screen.getAllByText("shared")).toHaveLength(2);
  });

  it("gives a cross-market row every market, and a country row only its own", () => {
    const rows: GridRow[] = [
      { keyword: "cross-1", keyword_sort: 0, country: "SA", country_sort: 0, position: 5, prev_position: null },
    ];
    render(<RankingGrid rows={rows} roster={roster} groups={groups} />);
    // cross-1: one real position + 2 blanks. cross-2: 3. sa-only + shared(SA): 1 each.
    // shared(KW): 1. Country rows must NOT claim the markets they don't target.
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getAllByText("Not in top 100")).toHaveLength(8);
  });

  it("counts each block by its own rows, so the header matches what is listed", () => {
    render(<RankingGrid rows={[]} roster={roster} groups={groups} />);
    // ALL and SA hold 2 keywords each; KW holds the single shared one.
    expect(screen.getAllByText(/· 2 keywords/)).toHaveLength(2);
    expect(screen.getAllByText(/· 1 keyword$/)).toHaveLength(1);
  });

  it("falls back to inferring the shape when no groups are supplied", () => {
    const rows: GridRow[] = [
      { keyword: "kw-a", keyword_sort: 0, country: "SA", country_sort: 0, position: 4, prev_position: 4 },
    ];
    render(<RankingGrid rows={rows} trackedMarkets={new Map([["kw-a", ["SA"]]])} />);
    expect(screen.getByText("kw-a")).toBeTruthy();
  });
});
