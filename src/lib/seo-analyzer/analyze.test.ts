import { describe, it, expect, vi, afterEach } from "vitest";
import { analyzeUrl } from "./analyze";

const HTML = `<!doctype html><html lang="ar" dir="rtl"><head><title>عنوان مناسب للصفحة الرئيسية</title>
<meta name="description" content="وصف طويل بما يكفي ليظهر كاملا في نتائج البحث وليس مقتطعا في المنتصف.">
</head><body><h1>عنوان</h1><h2>قسم</h2><a href="/x">داخلي</a>${"كلمة ".repeat(700)}</body></html>`;

/** Route each URL to a canned response; anything unrouted 404s. */
function stubFetch(routes: Record<string, { status?: number; body: string; headers?: Record<string, string> }>) {
  const spy = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    const hit = routes[url];
    if (!hit) return new Response("nope", { status: 404 });
    return new Response(hit.body, { status: hit.status ?? 200, headers: hit.headers });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("analyzeUrl", () => {
  it("refuses to score a non-200 instead of reporting every test as failed", async () => {
    // The live origin answers a bare "Mozilla/5.0" UA with 406, and scoring that error
    // page would have published a catastrophic score for a perfectly healthy site.
    stubFetch({ "https://x.test/": { status: 406, body: "<html><h1>Not Acceptable!</h1></html>" } });
    await expect(analyzeUrl("https://x.test/")).rejects.toThrow(/HTTP 406/);
  });

  it("refuses a body with no markup", async () => {
    stubFetch({ "https://x.test/": { body: "{}" } });
    await expect(analyzeUrl("https://x.test/")).rejects.toThrow(/nothing to analyze/);
  });

  it("sends an identifying User-Agent that is not the blocked bare Mozilla string", async () => {
    const spy = stubFetch({ "https://x.test/": { body: HTML } });
    await analyzeUrl("https://x.test/").catch(() => {});
    const ua = (spy.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
    expect(ua["User-Agent"]).toMatch(/GRG-Dashboard-SEO-Analyzer/);
    expect(ua["User-Agent"]).not.toBe("Mozilla/5.0");
  });

  it("follows the sitemap robots.txt declares rather than assuming /sitemap.xml", async () => {
    // .org publishes /urls.xml — probing only the conventional path reports "no sitemap".
    stubFetch({
      "https://x.test/": { body: HTML },
      "https://x.test/robots.txt": { body: "User-agent: *\nDisallow: /cdn-cgi/\nSitemap: https://x.test/urls.xml" },
      "https://x.test/urls.xml": { body: "<urlset><url><loc>https://x.test/</loc></url></urlset>" },
    });
    const a = await analyzeUrl("https://x.test/");
    const sitemap = a.checks.find((c) => c.id === "sitemap")!;
    expect(sitemap.status).toBe("passed");
    expect(sitemap.detail).toContain("1 URLs");
  });

  it("reads a site-wide block but ignores a path-scoped Disallow", async () => {
    stubFetch({
      "https://x.test/": { body: HTML },
      "https://x.test/robots.txt": { body: "User-agent: *\nDisallow: /cdn-cgi/" },
    });
    expect((await analyzeUrl("https://x.test/")).checks.find((c) => c.id === "robots-txt")!.status).toBe("passed");

    stubFetch({
      "https://x.test/": { body: HTML },
      "https://x.test/robots.txt": { body: "User-agent: *\nDisallow: /" },
    });
    expect((await analyzeUrl("https://x.test/")).checks.find((c) => c.id === "robots-txt")!.status).toBe("failed");
  });

  it("does not mistake a SPA fallback page for a robots.txt", async () => {
    stubFetch({
      "https://x.test/": { body: HTML },
      "https://x.test/robots.txt": { body: "<html><body>404 page</body></html>" },
    });
    expect((await analyzeUrl("https://x.test/")).checks.find((c) => c.id === "robots-txt")!.status).toBe("warning");
  });

  it("produces the four numbers the dashboard stores", async () => {
    stubFetch({
      "https://x.test/": { body: HTML, headers: { "content-encoding": "br" } },
      "https://x.test/robots.txt": { body: "Sitemap: https://x.test/sitemap.xml" },
      "https://x.test/sitemap.xml": { body: "<urlset><url><loc>https://x.test/</loc></url></urlset>" },
    });
    const a = await analyzeUrl("https://x.test/");
    expect(a.score.score).toBeGreaterThan(0);
    expect(a.score.score).toBeLessThanOrEqual(100);
    expect(a.score.passed + a.score.warnings + a.score.failed + a.score.notApplicable).toBe(a.checks.length);
  });
});
