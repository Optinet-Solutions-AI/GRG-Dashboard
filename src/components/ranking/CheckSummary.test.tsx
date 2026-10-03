import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckSummary } from "./CheckSummary";

const base = {
  week_date: "2026-10-02",
  keywords_checked: 50,
  pairs_checked: 72,
  pairs_ranked: 0,
  markets: ["AE", "KW"],
};

describe("CheckSummary — 'checked' must not look like 'never checked'", () => {
  it("says the site WAS checked when nothing reached the top 100", () => {
    // The real .org case: 50 keywords over 2 markets, zero ranked, zero rows stored.
    render(<CheckSummary check={base} />);
    expect(screen.getByText(/Checked — nothing in the top 100 yet/)).toBeTruthy();
    expect(screen.getByText(/None reached the top 100/)).toBeTruthy();
  });

  it("reports the real scope of the run, not just that it happened", () => {
    render(<CheckSummary check={base} />);
    const body = document.body.textContent ?? "";
    expect(body).toContain("50");
    expect(body).toContain("72");
    expect(body).toContain("2026-10-02");
  });

  it("lists the markets that were checked, labelled the same way the grid labels them", () => {
    render(<CheckSummary check={base} />);
    const body = document.body.textContent ?? "";
    // marketLabel expands AE to UAE and leaves the other codes alone, so the summary reads
    // the same as the column headers above it.
    expect(body).toContain("UAE");
    expect(body).toContain("KW");
  });

  it("switches wording when some keywords do rank", () => {
    render(<CheckSummary check={{ ...base, pairs_ranked: 2 }} />);
    expect(screen.getByText(/only some keywords rank so far/)).toBeTruthy();
    expect(screen.queryByText(/None reached the top 100/)).toBeNull();
  });

  it("reassures that an empty grid is not a broken tracker", () => {
    render(<CheckSummary check={base} />);
    expect(screen.getByText(/checked, not that tracking is broken/)).toBeTruthy();
  });

  it("survives a check with no markets recorded instead of rendering an empty gap", () => {
    render(<CheckSummary check={{ ...base, markets: [] }} />);
    expect(screen.getByText(/no markets recorded/)).toBeTruthy();
  });
});
