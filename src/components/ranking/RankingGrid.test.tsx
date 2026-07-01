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
