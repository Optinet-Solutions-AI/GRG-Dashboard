import "server-only";
import type { PageSpeedSource, PageSpeedResult, Strategy } from "./types";
import { parsePsiScore } from "./parse-psi";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

async function fetchStrategy(url: string, strategy: Strategy): Promise<PageSpeedResult> {
  const params = new URLSearchParams({ url, strategy, category: "performance" });
  const key = process.env.PAGESPEED_API_KEY;
  if (key) params.set("key", key);
  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return { strategy, score: null };
    return { strategy, score: parsePsiScore(await res.json()) };
  } catch {
    return { strategy, score: null };
  }
}

export const pageSpeedInsights: PageSpeedSource = {
  id: "pagespeed-insights",
  async fetchScores(url: string): Promise<PageSpeedResult[]> {
    return Promise.all([fetchStrategy(url, "mobile"), fetchStrategy(url, "desktop")]);
  },
};
