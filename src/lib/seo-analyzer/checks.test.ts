import { describe, it, expect } from "vitest";
import { runChecks, type SiteContext } from "./checks";
import { scoreChecks } from "./score";
import type { PageFacts } from "./extract";

const facts = (over: Partial<PageFacts> = {}): PageFacts => ({
  title: "A perfectly reasonable SEO title here",
  metaDescription: "A meta description that sits comfortably inside the range Google renders in full.",
  canonical: "https://x.test/",
  metaRobots: "index, follow",
  lang: "ar",
  dir: "rtl",
  hasViewport: true,
  hasFavicon: true,
  h1: ["The one and only H1"],
  h2Count: 4,
  h3Count: 2,
  wordCount: 900,
  images: { total: 4, withAlt: 4 },
  links: { internal: 12, external: 3, nofollowExternal: 1 },
  jsonLdTypes: ["Organization"],
  jsonLdBroken: 0,
  og: ["title", "description", "image"],
  twitter: ["card"],
  hreflang: ["ar", "en", "x-default"],
  mixedContent: 0,
  ...over,
});

const ctx = (over: Partial<SiteContext> = {}): SiteContext => ({
  url: "https://x.test/",
  httpStatus: 200,
  https: true,
  robots: { found: true, blocksAll: false, sitemaps: ["https://x.test/sitemap.xml"] },
  sitemap: { found: true, urlCount: 42 },
  headers: { contentEncoding: "br", hsts: true, xRobotsTag: null },
  responseMs: 300,
  ...over,
});

const status = (id: string, f = facts(), c = ctx()) => runChecks(f, c).find((x) => x.id === id)!.status;

describe("runChecks — a healthy page", () => {
  it("passes everything and scores 100", () => {
    const checks = runChecks(facts(), ctx());
    const scored = scoreChecks(checks);
    expect(scored.failed).toBe(0);
    expect(scored.warnings).toBe(0);
    expect(scored.score).toBe(100);
  });
});

describe("runChecks — titles and descriptions", () => {
  it("fails a missing title and warns on a stubby one", () => {
    expect(status("title", facts({ title: null }))).toBe("failed");
    expect(status("title", facts({ title: "Too short" }))).toBe("warning");
    expect(status("title", facts({ title: "x".repeat(90) }))).toBe("warning");
  });

  it("fails a missing description and warns when it is out of range", () => {
    expect(status("description", facts({ metaDescription: null }))).toBe("failed");
    expect(status("description", facts({ metaDescription: "short" }))).toBe("warning");
  });
});

describe("runChecks — content and structure", () => {
  it("grades content length in three bands", () => {
    expect(status("content-length", facts({ wordCount: 900 }))).toBe("passed");
    expect(status("content-length", facts({ wordCount: 420 }))).toBe("warning");
    expect(status("content-length", facts({ wordCount: 120 }))).toBe("failed");
  });

  it("wants exactly one H1", () => {
    expect(status("h1", facts({ h1: [] }))).toBe("failed");
    expect(status("h1", facts({ h1: ["a", "b"] }))).toBe("warning");
  });

  it("treats alt text as not-applicable when the page has no images at all", () => {
    // Both live sites render zero <img> elements, so scoring alt text would be inventing
    // a pass (or a failure) for something that doesn't exist on the page.
    expect(status("image-alt", facts({ images: { total: 0, withAlt: 0 } }))).toBe("not-applicable");
    expect(status("image-alt", facts({ images: { total: 3, withAlt: 0 } }))).toBe("failed");
    expect(status("image-alt", facts({ images: { total: 3, withAlt: 1 } }))).toBe("warning");
  });

  it("fails a page with no internal links but only warns with no outbound ones", () => {
    expect(status("internal-links", facts({ links: { internal: 0, external: 2, nofollowExternal: 0 } }))).toBe("failed");
    expect(status("outbound-links", facts({ links: { internal: 5, external: 0, nofollowExternal: 0 } }))).toBe("warning");
  });
});

describe("runChecks — indexability and crawling", () => {
  it("fails a noindex from either the meta tag or the header", () => {
    expect(status("indexable", facts({ metaRobots: "noindex, follow" }))).toBe("failed");
    expect(status("indexable", facts(), ctx({ headers: { contentEncoding: "br", hsts: true, xRobotsTag: "noindex" } }))).toBe("failed");
  });

  it("separates a missing robots.txt from one that blocks the whole site", () => {
    expect(status("robots-txt", facts(), ctx({ robots: { found: false, blocksAll: false, sitemaps: [] } }))).toBe("warning");
    expect(status("robots-txt", facts(), ctx({ robots: { found: true, blocksAll: true, sitemaps: [] } }))).toBe("failed");
  });

  it("fails when no sitemap could be found", () => {
    expect(status("sitemap", facts(), ctx({ sitemap: { found: false, urlCount: null } }))).toBe("failed");
  });
});

describe("runChecks — schema, social and localisation", () => {
  it("rates unparseable JSON-LD as a failure, not as markup present", () => {
    expect(status("schema", facts({ jsonLdTypes: [], jsonLdBroken: 1 }))).toBe("failed");
    expect(status("schema", facts({ jsonLdTypes: [], jsonLdBroken: 0 }))).toBe("failed");
    expect(status("schema", facts({ jsonLdTypes: ["FAQPage"], jsonLdBroken: 0 }))).toBe("passed");
  });

  it("warns on partial Open Graph and fails when there is none", () => {
    expect(status("open-graph", facts({ og: [] }))).toBe("failed");
    expect(status("open-graph", facts({ og: ["title"] }))).toBe("warning");
  });

  it("fails an Arabic page that is not marked rtl, and skips the check for English", () => {
    expect(status("rtl", facts({ lang: "ar", dir: null }))).toBe("failed");
    expect(status("rtl", facts({ lang: "ar", dir: "ltr" }))).toBe("failed");
    expect(status("rtl", facts({ lang: "en", dir: null }))).toBe("not-applicable");
  });

  it("wants an x-default among the hreflang values", () => {
    expect(status("hreflang", facts({ hreflang: ["ar", "en"] }))).toBe("warning");
    expect(status("hreflang", facts({ hreflang: [] }))).toBe("warning");
    expect(status("hreflang", facts({ hreflang: ["ar", "x-default"] }))).toBe("passed");
  });
});

describe("runChecks — delivery", () => {
  it("warns on a slow response and on missing compression", () => {
    expect(status("response-time", facts(), ctx({ responseMs: 4000 }))).toBe("warning");
    expect(status("compression", facts(), ctx({ headers: { contentEncoding: null, hsts: true, xRobotsTag: null } }))).toBe("warning");
  });

  it("fails mixed content on an https page", () => {
    expect(status("mixed-content", facts({ mixedContent: 3 }))).toBe("failed");
  });
});
