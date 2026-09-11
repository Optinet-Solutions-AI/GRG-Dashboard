import { describe, it, expect } from "vitest";
import { routeBacklinksBySite, targetHost } from "./route-by-site";
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
      SITES,
    );
    expect(r.bySite.get("id-com")?.length).toBe(1);
    expect(r.bySite.get("id-org")?.length).toBe(1);
  });

  it("does not leave .org links attributed to .com", () => {
    // The live bug: 40 .org links were counted under .com, showing 199 backlinks
    // on a site that had 159.
    const r = routeBacklinksBySite([row("https://gulfrecoverygroup.org/")], SITES);
    expect(r.bySite.get("id-com") ?? []).toEqual([]);
    expect(r.bySite.get("id-org")?.length).toBe(1);
  });

  it("ignores a www prefix", () => {
    const r = routeBacklinksBySite([row("https://www.gulfrecoverygroup.net/page")], SITES);
    expect(r.bySite.get("id-net")?.length).toBe(1);
  });

  it("reports a blank target instead of filing it under a default site", () => {
    const r = routeBacklinksBySite([row("")], SITES);
    expect(r.bySite.get("id-com")).toEqual([]);
    expect(r.unrouted.length).toBe(1);
  });

  it("reports an unrelated domain rather than attributing it to one of our sites", () => {
    const r = routeBacklinksBySite([row("https://example.com/x")], SITES);
    for (const bucket of r.bySite.values()) expect(bucket).toEqual([]);
    expect(r.unrouted.length).toBe(1);
  });

  it("does not confuse a lookalike suffix domain", () => {
    const r = routeBacklinksBySite([row("https://gulfrecoverygroup.com.br/x")], SITES);
    for (const bucket of r.bySite.values()) expect(bucket).toEqual([]);
    expect(r.unrouted.length).toBe(1);
  });

  it("includes an empty bucket for a site the sheet has no rows for, so its stale rows get cleared", () => {
    const r = routeBacklinksBySite([row("https://gulfrecoverygroup.com/")], SITES);
    expect(r.bySite.has("id-net")).toBe(true);
    expect(r.bySite.get("id-net")).toEqual([]);
  });

  it("keeps every row accounted for: routed + unrouted equals the input", () => {
    const rows = [
      row("https://gulfrecoverygroup.com/"),
      row("https://gulfrecoverygroup.org/"),
      row("https://example.com/"),
      row(""),
    ];
    const r = routeBacklinksBySite(rows, SITES);
    const routed = [...r.bySite.values()].reduce((n, b) => n + b.length, 0);
    expect(routed + r.unrouted.length).toBe(rows.length);
    expect(routed).toBe(2);
  });
});

describe("targetHost", () => {
  it("names the host so an unrouted row can be explained", () => {
    expect(targetHost(row("https://www.example.com/x"))).toBe("example.com");
    expect(targetHost(row(""))).toBe("(blank)");
    expect(targetHost(row("not a url"))).toMatch(/unparseable/);
  });
});
