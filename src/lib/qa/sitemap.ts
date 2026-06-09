import "server-only";

/** Extract all <loc> URLs from a sitemap or sitemap-index XML string. */
export function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
}

const isXml = (u: string) => /\.xml(\?|$)/i.test(u);

/**
 * Crawl a site's sitemap (handles a sitemap index pointing to sub-sitemaps,
 * one level deep) and return the de-duplicated list of page URLs.
 */
export async function crawlSitemapPages(siteUrl: string): Promise<string[]> {
  const base = siteUrl.replace(/\/+$/, "");
  const fetchXml = async (u: string): Promise<string | null> => {
    try {
      const r = await fetch(u, { cache: "no-store", redirect: "follow" });
      return r.ok ? await r.text() : null;
    } catch {
      return null;
    }
  };

  const root = (await fetchXml(`${base}/sitemap.xml`)) ?? (await fetchXml(`${base}/sitemap_index.xml`));
  if (!root) return [];

  const pages = new Set<string>();
  const seen = new Set<string>();
  for (const loc of extractLocs(root)) {
    if (isXml(loc)) {
      if (seen.has(loc)) continue;
      seen.add(loc);
      const sub = await fetchXml(loc);
      if (sub) for (const p of extractLocs(sub)) if (!isXml(p)) pages.add(p);
    } else {
      pages.add(loc);
    }
  }
  return [...pages];
}
