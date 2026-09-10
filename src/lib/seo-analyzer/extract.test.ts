import { describe, it, expect } from "vitest";
import { extractFacts } from "./extract";

const page = (head: string, body: string, htmlAttrs = ' lang="ar" dir="rtl"') =>
  `<!doctype html><html${htmlAttrs}><head>${head}</head><body>${body}</body></html>`;

describe("extractFacts", () => {
  it("reads the head tags an SEO score depends on", () => {
    const f = extractFacts(
      page(
        `<title>  استرجاع الأموال | الدليل  </title>
         <meta name="description" content="وصف الصفحة">
         <meta name="robots" content="index, follow">
         <meta name="viewport" content="width=device-width">
         <link rel="canonical" href="https://x.test/">
         <link rel="icon" href="/favicon.ico">
         <link rel="alternate" hreflang="ar" href="https://x.test/ar/">
         <link rel="alternate" hreflang="x-default" href="https://x.test/">
         <meta property="og:title" content="t"><meta property="og:image" content="i">
         <meta name="twitter:card" content="summary">`,
        "<h1>عنوان</h1>",
      ),
      "https://x.test/",
    );
    expect(f.title).toBe("استرجاع الأموال | الدليل");
    expect(f.metaDescription).toBe("وصف الصفحة");
    expect(f.canonical).toBe("https://x.test/");
    expect(f.metaRobots).toBe("index, follow");
    expect(f.lang).toBe("ar");
    expect(f.dir).toBe("rtl");
    expect(f.hasViewport).toBe(true);
    expect(f.hasFavicon).toBe(true);
    expect(f.hreflang).toEqual(["ar", "x-default"]);
    expect(f.og.sort()).toEqual(["image", "title"]);
    expect(f.twitter).toEqual(["card"]);
  });

  it("counts words on the body only, ignoring scripts and styles", () => {
    const f = extractFacts(
      page(
        "<title>t</title><style>.a{color:red}</style>",
        `<p>one two three four five</p>
         <script>const padding = "word word word word word word word word word";</script>
         <style>.b{background:url(x)}</style>`,
      ),
      "https://x.test/",
    );
    expect(f.wordCount).toBe(5);
  });

  it("separates internal from external links and spots nofollow", () => {
    const f = extractFacts(
      page(
        "<title>t</title>",
        `<a href="/about">a</a><a href="https://www.x.test/deep">b</a>
         <a href="https://other.test/x" rel="nofollow noopener">c</a>
         <a href="https://third.test/y">d</a>
         <a href="#anchor">skip</a><a href="mailto:a@b.c">skip</a>`,
      ),
      "https://x.test/",
    );
    expect(f.links).toEqual({ internal: 2, external: 2, nofollowExternal: 1 });
  });

  it("collects schema types from nested JSON-LD and flags blocks that don't parse", () => {
    const f = extractFacts(
      page(
        `<title>t</title>
         <script type="application/ld+json">{"@type":"Organization","founder":{"@type":"Person"}}</script>
         <script type="application/ld+json">{"@type":["WebSite","WebPage"]}</script>
         <script type="application/ld+json">{ not json }</script>`,
        "<h1>h</h1>",
      ),
      "https://x.test/",
    );
    expect(f.jsonLdTypes.sort()).toEqual(["Organization", "Person", "WebPage", "WebSite"]);
    expect(f.jsonLdBroken).toBe(1);
  });

  it("counts images with and without alt text", () => {
    const f = extractFacts(
      page("<title>t</title>", `<img src="a.png" alt="وصف"><img src='b.png' alt=""><img src="c.png">`),
      "https://x.test/",
    );
    expect(f.images).toEqual({ total: 3, withAlt: 1 });
  });

  it("flags http subresources only when the page itself is https", () => {
    const body = `<img src="http://cdn.test/a.png"><link href="http://cdn.test/a.css">`;
    expect(extractFacts(page("<title>t</title>", body), "https://x.test/").mixedContent).toBe(2);
    expect(extractFacts(page("<title>t</title>", body), "http://x.test/").mixedContent).toBe(0);
  });

  it("survives markup with no head, no title and unclosed tags", () => {
    const f = extractFacts("<html><body><p>bare<div>text", "https://x.test/");
    expect(f.title).toBeNull();
    expect(f.metaDescription).toBeNull();
    expect(f.h1).toEqual([]);
    expect(f.wordCount).toBeGreaterThan(0);
  });

  it("counts every H1 so a page with several can be flagged", () => {
    const f = extractFacts(page("<title>t</title>", "<h1>one</h1><h2>s</h2><h1>two</h1><h3>x</h3>"), "https://x.test/");
    expect(f.h1).toEqual(["one", "two"]);
    expect(f.h2Count).toBe(1);
    expect(f.h3Count).toBe(1);
  });
});
