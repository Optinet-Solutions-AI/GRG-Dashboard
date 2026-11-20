import { describe, it, expect } from "vitest";
import { organicKeywords, keyAllowance, DiscoveryError } from "./ahrefs-organic";

const ok = (rows: unknown[], headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ keywords: rows }), { status: 200, headers });

const row = { keyword: "k", keyword_country: "SA", best_position: 3, best_position_url: "u", volume: 10 };

describe("organicKeywords", () => {
  it("asks for the priced fields, highest volume first, for one market", async () => {
    let seen = "";
    const fetchImpl = (async (url: string | URL) => { seen = String(url); return ok([row]); }) as unknown as typeof fetch;
    await organicKeywords("k", { target: "gulfrecoverygroup.com", country: "SA", date: "2026-11-20" }, { fetchImpl });
    expect(seen).toContain("site-explorer/organic-keywords");
    expect(seen).toContain("country=sa");
    expect(seen).toContain("order_by=volume%3Adesc");
    expect(seen).toContain("limit=25");
  });

  /**
   * The charge must be read from the `-actual` header. Ahrefs' free test targets report a full
   * price in `x-api-units-cost-total` while charging nothing, so a guard reading the nominal
   * header would refuse work that is free — and, worse, trust a real charge it never saw.
   */
  it("reports what Ahrefs actually charged, not the nominal price", async () => {
    // 25 rows at 14 units is exactly 350, so the charge is one the rows explain.
    const fullPage = Array.from({ length: 25 }, () => row);
    const fetchImpl = (async () => ok(fullPage, {
      "x-api-units-cost-total": "700",
      "x-api-units-cost-total-actual": "350",
    })) as unknown as typeof fetch;
    const res = await organicKeywords("k", { target: "t", country: "SA", date: "d" }, { fetchImpl });
    expect(res.unitsCharged).toBe(350);
  });

  it("treats a free test target as free", async () => {
    const fetchImpl = (async () => ok([row], { "x-api-units-cost-total": "700", "x-api-units-cost-total-actual": "0" })) as unknown as typeof fetch;
    expect((await organicKeywords("k", { target: "t", country: "SA", date: "d" }, { fetchImpl })).unitsCharged).toBe(0);
  });

  // If Ahrefs' pricing changes, stop — do not keep spending a key the rankings sync needs.
  it("halts when the charge is more than the rows can explain", async () => {
    const fetchImpl = (async () => ok([row], { "x-api-units-cost-total-actual": "5000" })) as unknown as typeof fetch;
    await expect(organicKeywords("k", { target: "t", country: "SA", date: "d" }, { fetchImpl }))
      .rejects.toMatchObject({ halt: true });
  });

  it("names a rejected key without quoting it", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
    await expect(organicKeywords("sekrit", { target: "t", country: "SA", date: "d" }, { fetchImpl }))
      .rejects.toThrow(/rejected the key/i);
    await expect(organicKeywords("sekrit", { target: "t", country: "SA", date: "d" }, { fetchImpl }))
      .rejects.not.toThrow(/sekrit/);
  });

  it("says plainly when Ahrefs rate-limits the pull", async () => {
    const fetchImpl = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    await expect(organicKeywords("k", { target: "t", country: "SA", date: "d" }, { fetchImpl }))
      .rejects.toThrow(/rate-limited/i);
  });

  it("is a DiscoveryError, so a caller can tell it from a programming fault", async () => {
    const fetchImpl = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    await expect(organicKeywords("k", { target: "t", country: "SA", date: "d" }, { fetchImpl }))
      .rejects.toBeInstanceOf(DiscoveryError);
  });
});

describe("keyAllowance", () => {
  it("reads the key's own limit and usage", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      limits_and_usage: { units_limit_api_key: 10000, units_usage_api_key: 350 },
    }), { status: 200 })) as unknown as typeof fetch;
    expect(await keyAllowance("k", { fetchImpl })).toEqual({ limit: 10000, used: 350 });
  });

  // Unknown is not the same as plenty: the caller refuses to spend on a null.
  it("returns null rather than guessing when Ahrefs will not say", async () => {
    const fetchImpl = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await keyAllowance("k", { fetchImpl })).toBeNull();
  });
});
