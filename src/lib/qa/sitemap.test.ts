import { describe, it, expect } from "vitest";
import { extractLocs } from "./sitemap";

describe("extractLocs", () => {
  it("extracts loc URLs from a urlset", () => {
    const xml = "<urlset><url><loc>https://a.com/</loc></url><url><loc> https://a.com/x </loc></url></urlset>";
    expect(extractLocs(xml)).toEqual(["https://a.com/", "https://a.com/x"]);
  });
  it("extracts sub-sitemap locs from an index", () => {
    const xml = "<sitemapindex><sitemap><loc>https://a.com/page-sitemap.xml</loc></sitemap></sitemapindex>";
    expect(extractLocs(xml)).toEqual(["https://a.com/page-sitemap.xml"]);
  });
  it("returns empty for no locs", () => {
    expect(extractLocs("<urlset></urlset>")).toEqual([]);
  });
});
