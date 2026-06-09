/** Extract the Lighthouse performance score (0..1) from a PSI v5 response and scale to 0..100. */
export function parsePsiScore(json: unknown): number | null {
  const score = (json as {
    lighthouseResult?: { categories?: { performance?: { score?: unknown } } };
  })?.lighthouseResult?.categories?.performance?.score;
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  return Math.round(score * 100);
}

export type PsiCategories = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
};

/** Extract all four Lighthouse category scores (0..100) from a PSI v5 response. */
export function parsePsiCategories(json: unknown): PsiCategories {
  const cats = (json as { lighthouseResult?: { categories?: Record<string, { score?: unknown }> } })
    ?.lighthouseResult?.categories;
  const pick = (key: string): number | null => {
    const s = cats?.[key]?.score;
    return typeof s === "number" && !Number.isNaN(s) ? Math.round(s * 100) : null;
  };
  return {
    performance: pick("performance"),
    accessibility: pick("accessibility"),
    bestPractices: pick("best-practices"),
    seo: pick("seo"),
  };
}

/** Extract the page screenshot the PSI/Lighthouse response embeds (a data: URI), or null. */
export function parsePsiScreenshot(json: unknown): string | null {
  const data = (json as {
    lighthouseResult?: { audits?: Record<string, { details?: { data?: unknown } }> };
  })?.lighthouseResult?.audits?.["final-screenshot"]?.details?.data;
  return typeof data === "string" && data.startsWith("data:") ? data : null;
}
