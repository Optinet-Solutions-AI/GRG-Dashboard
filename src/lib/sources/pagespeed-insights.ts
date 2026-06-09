import "server-only";
import type { PageSpeedSource, PageSpeedResult, Strategy } from "./types";
import { parsePsiCategories, parsePsiScreenshot } from "./parse-psi";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;

const EMPTY = (strategy: Strategy): PageSpeedResult => ({
  strategy, score: null, accessibility: null, bestPractices: null, seo: null, screenshot: null,
});

async function fetchStrategy(url: string, strategy: Strategy): Promise<PageSpeedResult> {
  const params = new URLSearchParams({ url, strategy });
  for (const c of CATEGORIES) params.append("category", c);
  const key = process.env.PAGESPEED_API_KEY;
  if (key) params.set("key", key);
  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return EMPTY(strategy);
    const json = await res.json();
    const c = parsePsiCategories(json);
    return {
      strategy,
      score: c.performance,
      accessibility: c.accessibility,
      bestPractices: c.bestPractices,
      seo: c.seo,
      screenshot: parsePsiScreenshot(json),
    };
  } catch {
    return EMPTY(strategy);
  }
}

export const pageSpeedInsights: PageSpeedSource = {
  id: "pagespeed-insights",
  async fetchScores(url: string): Promise<PageSpeedResult[]> {
    return Promise.all([fetchStrategy(url, "mobile"), fetchStrategy(url, "desktop")]);
  },
};
