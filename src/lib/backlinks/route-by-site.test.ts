import { describe, it, expect } from "vitest";
import { routeBacklinksBySite } from "./route-by-site";
import type { SheetBacklink } from "./parse-sheet";

const row = (target_url: string): SheetBacklink => ({
  source_site: "blogspot.com", source_url: "https://blogspot.com/a", anchor_text: "",
  target_url, indexed: null, status: null, remarks: null, date: "2026-09-01",
});

const SITES = [
  { id: "id-com", domain: "gulfrecoverygroup.com" },
  { id: "id-org", domain: "gulfrecoverygroup.org" },
  { id: "id-net", domain: "gulfrecoverygroup.net" },
];

describe("routeBacklinksBySite", () => {
  it("sends each row to the site its target_url points at", () => {
    const r = routeBacklinksBySite(
      [row("https://gulfrecoverygroup.com/x"), row("https://gulfrecoverygroup.org/")],
      SITES, "gulfrecoverygroup.com",
    );
    expect(r.bySite.get("id-com")?.length).toBe(1);
    expect(r.bySite.get("id-org")?.length).toBe(1);
  });

  it("does not leave .org links attributed to .com", () => {
    // The live bug: all 179 sheet rows landed on .com, 30 of them targeting .org.
    const r = routeBacklinksBySite([row("https://gulfrecoverygroup.org/")], SITES, "gulfrecoverygroup.com");
    expect(r.bySite.get("id-com") ?? []).toEqual([]);
    expect(r.bySite.get("id-org")?.length).toBe(1);
  });

  it("ignores a www prefix", () => {
    const r = routeBacklinksBySite([row("https://www.gulfrecoverygroup.net/page")], SITES, "gulfrecoverygroup.com");
    expect(r.bySite.get("id-net")?.length).toBe(1);
  });

  it("falls back to the default site for a blank target, and counts it", () => {
    const r = routeBacklinksBySite([row("")], SITES, "gulfrecoverygroup.com");
    expect(r.bySite.get("id-com")?.length).toBe(1);
    expect(r.unrouted).toBe(1);
  });

  it("falls back for an unrelated domain rather than dropping the row", () => {
    const r = routeBacklinksBySite([row("https://example.com/x")], SITES, "gulfrecoverygroup.com");
    expect(r.bySite.get("id-com")?.length).toBe(1);
    expect(r.unrouted).toBe(1);
  });

  it("does not confuse a lookalike suffix domain", () => {
    const r = routeBacklinksBySite([row("https://gulfrecoverygroup.com.br/x")], SITES, "gulfrecoverygroup.org");
    expect(r.bySite.get("id-com") ?? []).toEqual([]);
    expect(r.bySite.get("id-org")?.length).toBe(1); // fallback
    expect(r.unrouted).toBe(1);
  });

  it("includes an empty bucket for a site the sheet has no rows for, so its stale rows get cleared", () => {
    const r = routeBacklinksBySite([row("https://gulfrecoverygroup.com/")], SITES, "gulfrecoverygroup.com");
    expect(r.bySite.has("id-net")).toBe(true);
    expect(r.bySite.get("id-net")).toEqual([]);
  });

  it("throws when the fallback domain is not among the sites", () => {
    expect(() => routeBacklinksBySite([row("")], SITES, "nope.com")).toThrow(/nope\.com/);
  });
});
