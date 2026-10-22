import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BacklinksTable, type BacklinkRow } from "./BacklinksTable";

const row: BacklinkRow = {
  id: "1",
  date: "2026-10-13",
  source_site: "example.com",
  source_url: "https://example.com/a",
  anchor_text: "تجميد حساب التداول",
  target_url: "https://gulfrecoverygroup.com/",
  indexed: "Indexed by Google",
  status: "Indexed",
};

describe("BacklinksTable empty state", () => {
  it("says nothing has been synced when there is nothing at all", () => {
    render(<BacklinksTable rows={[]} />);
    expect(screen.getByText("No backlinks yet.")).toBeTruthy();
  });

  // With the tracked-keyword filter on, an empty table means the filter excluded everything.
  // "No backlinks yet" there reads as "the sync is broken", which is what it looked like on
  // .net — 497 links, none of them on a tracked keyword.
  it("lets the caller explain an emptiness it caused itself", () => {
    render(<BacklinksTable rows={[]} emptyMessage="No links on this site's tracked keywords." />);
    expect(screen.getByText("No links on this site's tracked keywords.")).toBeTruthy();
    expect(screen.queryByText("No backlinks yet.")).toBeNull();
  });

  it("shows no empty message when there are rows", () => {
    render(<BacklinksTable rows={[row]} emptyMessage="should not appear" />);
    expect(screen.queryByText("should not appear")).toBeNull();
  });
});
