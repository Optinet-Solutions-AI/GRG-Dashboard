import { describe, it, expect } from "vitest";
import { parseQuery } from "./nlu";
import { qaPagesAnswer, siteChecklistAnswer, rankingAnswer, type QaPageRow, type GridRow } from "./answers";
import { normalize } from "./text";

// Exercises the pure answer-formatters directly with synthetic rows — no DB,
// no server-only. Confirms the answer TEXT is correct and the cap applies.

const VOCAB = { countryCodes: ["SA", "QA", "OM", "KW", "BH", "AE"], keywords: [] as string[] };

function mkPage(over: Partial<QaPageRow>): QaPageRow {
  return {
    url: "/p", indexed_gsc: "Yes", status: "200", seo_issues: "—", ar_alignment_issues: "—",
    images_missing_alt: "0", title: "t", meta_description: "m", canonical: "/p", h1_count: "1", lang: "ar", ...over,
  };
}

describe("answer shapes", () => {
  it("lists pages that are not indexed (the screenshot fix)", () => {
    const rows: QaPageRow[] = [
      mkPage({ url: "/ar/a", indexed_gsc: "No" }),
      mkPage({ url: "/ar/b", indexed_gsc: "Yes" }),
      mkPage({ url: "/ar/c", indexed_gsc: "Not indexed" }),
    ];
    const q = parseQuery("what pages are not index", VOCAB);
    const out = qaPagesAnswer(q, rows);
    expect(out).toContain("🚫 Pages not indexed");
    expect(out).toContain("/ar/a");
    expect(out).toContain("/ar/c");
    expect(out).not.toContain("/ar/b");
    expect(out).toContain("(2)");
  });

  it("caps long lists at 10 with +N more", () => {
    const rows: QaPageRow[] = Array.from({ length: 14 }, (_, i) => mkPage({ url: `/p${i}`, indexed_gsc: "No" }));
    const q = parseQuery("which pages aren't indexed", VOCAB);
    const out = qaPagesAnswer(q, rows);
    expect(out).toContain("…and 4 more");
    expect(out).toContain("(14)");
  });

  it("returns a per-URL detail card", () => {
    const rows: QaPageRow[] = [mkPage({ url: "/ar/about", title: "About Us", seo_issues: "missing meta" })];
    const q = parseQuery("details for /ar/about", VOCAB);
    const out = qaPagesAnswer(q, rows);
    expect(out).toContain("/ar/about");
    expect(out).toContain("About Us");
    expect(out).toContain("missing meta");
  });

  it("summarizes the whole-site checklist and answers a specific field", () => {
    const row = {
      schema: "Yes", sitemap_gsc: "Submitted", ga: "Installed", gsc: "Verified", rankmath_seo: "90",
      caching_plugins: "WP Rocket", imagify: "On", html_lang: "ar", search_engine_visibility: "Public",
      index_status: "Indexed", site_icon: "Set",
    };
    const schema = siteChecklistAnswer(normalize("is schema set up?"), row);
    expect(schema).toContain("Schema");
    expect(schema).toContain("Yes");
    expect(siteChecklistAnswer(normalize("show the whole site checklist"), row)).toContain("Whole-site checklist");
  });

  it("lists keywords in the top N for a country", () => {
    const grid: GridRow[] = [
      { keyword: "k1", country: "SA", position: 2, prev_position: 3 },
      { keyword: "k2", country: "SA", position: 25, prev_position: 30 },
      { keyword: "k3", country: "SA", position: 8, prev_position: 8 },
    ];
    const q = parseQuery("how many keywords rank in top 10 in saudi", VOCAB);
    const out = rankingAnswer(q, "2026-06-08", "2026-06-01", grid);
    expect(out).toContain("In top 10 · Saudi Arabia");
    expect(out).toContain("k1");
    expect(out).toContain("k3");
    expect(out).not.toContain("k2");
  });

  it("lists what's not ranking for a country", () => {
    const grid: GridRow[] = [
      { keyword: "k1", country: "KW", position: 5, prev_position: 5 },
      { keyword: "k2", country: "KW", position: null, prev_position: null },
    ];
    const q = parseQuery("what is not ranking in kuwait", VOCAB);
    const out = rankingAnswer(q, "2026-06-08", "2026-06-01", grid);
    expect(out).toContain("🚫 Not ranking · Kuwait");
    expect(out).toContain("k2");
    expect(out).not.toContain("k1");
  });
});
