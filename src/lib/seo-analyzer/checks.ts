// The test suite behind the SEO score for the non-WordPress sites (.org, .net).
//
// It mirrors Rank Math's *SEO Analyzer* — the site-wide tool whose Passed / Warnings /
// Failed counts .com's hand-entered numbers come from — NOT the per-post focus-keyword
// panel. That choice is what makes this comparable to what we already record, and it is
// why nothing here needs a focus keyword.
//
// This is an approximation, not a clone: Rank Math's exact weights are internal, so the
// number will not match theirs digit for digit. What it does guarantee is a consistent,
// reproducible score for a site Rank Math can't reach at all, with every check spelled
// out so a change in the number can always be explained.
//
// Two of these are project rules rather than Rank Math's (Arabic `dir`, hreflang with an
// x-default) because every page on these sites is Arabic-first — see CLAUDE.md.

import type { PageFacts } from "./extract";

export type CheckStatus = "passed" | "warning" | "failed" | "not-applicable";
export type CheckGroup = "Basic SEO" | "Advanced SEO" | "Performance" | "Security";

export type Check = {
  id: string;
  group: CheckGroup;
  label: string;
  status: CheckStatus;
  /** Criticals carry 2; everything else 1. A warning earns half its weight. */
  weight: number;
  detail: string;
};

export type SiteContext = {
  url: string;
  httpStatus: number;
  https: boolean;
  robots: { found: boolean; blocksAll: boolean; sitemaps: string[] };
  sitemap: { found: boolean; urlCount: number | null };
  headers: { contentEncoding: string | null; hsts: boolean; xRobotsTag: string | null };
  responseMs: number;
};

const TITLE_MIN = 15;
const TITLE_MAX = 65;
const DESC_MIN = 50;
const DESC_MAX = 165;
const CONTENT_GOOD = 600;
const CONTENT_THIN = 300;
const SLOW_MS = 2500;

const ok = (id: string, group: CheckGroup, label: string, detail: string, weight = 1): Check => ({ id, group, label, status: "passed", weight, detail });
const warn = (id: string, group: CheckGroup, label: string, detail: string, weight = 1): Check => ({ id, group, label, status: "warning", weight, detail });
const bad = (id: string, group: CheckGroup, label: string, detail: string, weight = 1): Check => ({ id, group, label, status: "failed", weight, detail });
const na = (id: string, group: CheckGroup, label: string, detail: string): Check => ({ id, group, label, status: "not-applicable", weight: 1, detail });

export function runChecks(f: PageFacts, ctx: SiteContext): Check[] {
  const checks: Check[] = [];
  const B = "Basic SEO" as const;
  const A = "Advanced SEO" as const;
  const P = "Performance" as const;
  const S = "Security" as const;

  // ---- Basic SEO -----------------------------------------------------------------
  checks.push(
    !f.title
      ? bad("title", B, "SEO title", "No <title> on the page", 2)
      : f.title.length < TITLE_MIN || f.title.length > TITLE_MAX
        ? warn("title", B, "SEO title", `${f.title.length} characters — aim for ${TITLE_MIN}-${TITLE_MAX}`, 2)
        : ok("title", B, "SEO title", `${f.title.length} characters`, 2),
  );

  checks.push(
    !f.metaDescription
      ? bad("description", B, "Meta description", "No meta description", 2)
      : f.metaDescription.length < DESC_MIN || f.metaDescription.length > DESC_MAX
        ? warn("description", B, "Meta description", `${f.metaDescription.length} characters — aim for ${DESC_MIN}-${DESC_MAX}`, 2)
        : ok("description", B, "Meta description", `${f.metaDescription.length} characters`, 2),
  );

  checks.push(
    f.h1.length === 1
      ? ok("h1", B, "Single H1", `"${f.h1[0].slice(0, 60)}"`, 2)
      : f.h1.length === 0
        ? bad("h1", B, "Single H1", "No H1 on the page", 2)
        : warn("h1", B, "Single H1", `${f.h1.length} H1s — search engines expect one`, 2),
  );

  checks.push(
    f.h2Count > 0
      ? ok("subheadings", B, "Subheadings", `${f.h2Count} H2 and ${f.h3Count} H3`)
      : warn("subheadings", B, "Subheadings", "No H2 — long copy without subheadings is hard to scan and to rank"),
  );

  checks.push(
    f.wordCount >= CONTENT_GOOD
      ? ok("content-length", B, "Content length", `${f.wordCount} words`, 2)
      : f.wordCount >= CONTENT_THIN
        ? warn("content-length", B, "Content length", `${f.wordCount} words — ${CONTENT_GOOD}+ competes better`, 2)
        : bad("content-length", B, "Content length", `${f.wordCount} words — thin`, 2),
  );

  checks.push(
    f.images.total === 0
      ? na("image-alt", B, "Image alt text", "The page has no <img> elements to describe")
      : f.images.withAlt === f.images.total
        ? ok("image-alt", B, "Image alt text", `all ${f.images.total} images have alt text`)
        : f.images.withAlt === 0
          ? bad("image-alt", B, "Image alt text", `none of ${f.images.total} images have alt text`)
          : warn("image-alt", B, "Image alt text", `${f.images.withAlt} of ${f.images.total} images have alt text`),
  );

  checks.push(
    f.links.internal > 0
      ? ok("internal-links", B, "Internal links", `${f.links.internal} internal links`)
      : bad("internal-links", B, "Internal links", "No internal links — nothing passes authority onward"),
  );

  checks.push(
    f.links.external > 0
      ? ok("outbound-links", B, "Outbound links", `${f.links.external} outbound (${f.links.nofollowExternal} nofollow)`)
      : warn("outbound-links", B, "Outbound links", "No outbound links — citing sources supports topical trust"),
  );

  // ---- Advanced SEO --------------------------------------------------------------
  checks.push(
    f.canonical
      ? ok("canonical", A, "Canonical URL", f.canonical)
      : warn("canonical", A, "Canonical URL", "No canonical tag — duplicate URLs can split signals"),
  );

  const noindex = /noindex/i.test(f.metaRobots ?? "") || /noindex/i.test(ctx.headers.xRobotsTag ?? "");
  checks.push(
    noindex
      ? bad("indexable", A, "Indexable", "The page is set to noindex", 2)
      : ok("indexable", A, "Indexable", f.metaRobots ? `robots: ${f.metaRobots}` : "nothing blocking indexing", 2),
  );

  checks.push(
    !ctx.robots.found
      ? warn("robots-txt", A, "robots.txt", "No robots.txt served")
      : ctx.robots.blocksAll
        ? bad("robots-txt", A, "robots.txt", "robots.txt disallows crawling of the whole site", 2)
        : ok("robots-txt", A, "robots.txt", `present${ctx.robots.sitemaps.length ? `, declares ${ctx.robots.sitemaps.length} sitemap(s)` : ", no Sitemap line"}`),
  );

  checks.push(
    ctx.sitemap.found
      ? ok("sitemap", A, "XML sitemap", ctx.sitemap.urlCount != null ? `${ctx.sitemap.urlCount} URLs` : "reachable", 2)
      : bad("sitemap", A, "XML sitemap", "No sitemap found via robots.txt or /sitemap.xml", 2),
  );

  checks.push(
    f.jsonLdBroken > 0
      ? bad("schema", A, "Schema.org markup", `${f.jsonLdBroken} JSON-LD block(s) don't parse — Google discards them`, 2)
      : f.jsonLdTypes.length > 0
        ? ok("schema", A, "Schema.org markup", f.jsonLdTypes.join(", "), 2)
        : bad("schema", A, "Schema.org markup", "No JSON-LD structured data", 2),
  );

  const ogNeeded = ["title", "description", "image"];
  const ogMissing = ogNeeded.filter((k) => !f.og.includes(k));
  checks.push(
    f.og.length === 0
      ? bad("open-graph", A, "Open Graph tags", "None — shared links render without a title, text or image")
      : ogMissing.length === 0
        ? ok("open-graph", A, "Open Graph tags", `og:${f.og.join(", og:")}`)
        : warn("open-graph", A, "Open Graph tags", `missing og:${ogMissing.join(", og:")}`),
  );

  checks.push(
    f.twitter.length > 0
      ? ok("twitter-card", A, "Twitter card", `twitter:${f.twitter.join(", twitter:")}`)
      : warn("twitter-card", A, "Twitter card", "No twitter: tags — X falls back to Open Graph"),
  );

  checks.push(
    !f.lang
      ? bad("lang", A, "Language declared", "No lang attribute on <html>", 2)
      : ok("lang", A, "Language declared", `lang="${f.lang}"${f.dir ? ` dir="${f.dir}"` : ""}`, 2),
  );

  // Project rule: these sites are Arabic-first, so an Arabic page without dir="rtl"
  // renders wrongly for every visitor — CLAUDE.md rates that Critical.
  const isArabic = (f.lang ?? "").toLowerCase().startsWith("ar");
  checks.push(
    !isArabic
      ? na("rtl", A, "RTL direction", `Page declares lang="${f.lang ?? "?"}", so RTL doesn't apply`)
      : (f.dir ?? "").toLowerCase() === "rtl"
        ? ok("rtl", A, "RTL direction", 'dir="rtl" on an Arabic page', 2)
        : bad("rtl", A, "RTL direction", `Arabic page with dir="${f.dir ?? "unset"}"`, 2),
  );

  checks.push(
    f.hreflang.length === 0
      ? warn("hreflang", A, "hreflang", "No hreflang — the Arabic and English URLs don't reference each other")
      : f.hreflang.some((h) => h.toLowerCase() === "x-default")
        ? ok("hreflang", A, "hreflang", f.hreflang.join(", "))
        : warn("hreflang", A, "hreflang", `${f.hreflang.join(", ")} — no x-default`),
  );

  checks.push(
    f.hasViewport
      ? ok("viewport", A, "Mobile viewport", "viewport meta present")
      : bad("viewport", A, "Mobile viewport", "No viewport meta — the page won't scale on mobile", 2),
  );

  checks.push(
    f.hasFavicon
      ? ok("favicon", A, "Favicon", "declared in <head>")
      : warn("favicon", A, "Favicon", "No icon link in <head>"),
  );

  // ---- Performance ---------------------------------------------------------------
  checks.push(
    ctx.responseMs <= SLOW_MS
      ? ok("response-time", P, "Server response", `${ctx.responseMs} ms to first byte of HTML`)
      : warn("response-time", P, "Server response", `${ctx.responseMs} ms — slower than ${SLOW_MS} ms`),
  );

  checks.push(
    ctx.headers.contentEncoding
      ? ok("compression", P, "Compression", `content-encoding: ${ctx.headers.contentEncoding}`)
      : warn("compression", P, "Compression", "Response isn't gzip/brotli compressed"),
  );

  // ---- Security ------------------------------------------------------------------
  checks.push(
    ctx.https
      ? ok("https", S, "HTTPS", "served over https", 2)
      : bad("https", S, "HTTPS", "Not served over https", 2),
  );

  checks.push(
    ctx.headers.hsts
      ? ok("hsts", S, "HSTS", "strict-transport-security set")
      : warn("hsts", S, "HSTS", "No strict-transport-security header"),
  );

  checks.push(
    f.mixedContent === 0
      ? ok("mixed-content", S, "No mixed content", "every subresource is https")
      : bad("mixed-content", S, "No mixed content", `${f.mixedContent} http:// subresource(s) on an https page`),
  );

  return checks;
}
