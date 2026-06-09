/** Extract the Lighthouse performance score (0..1) from a PSI v5 response and scale to 0..100. */
export function parsePsiScore(json: unknown): number | null {
  const score = (json as {
    lighthouseResult?: { categories?: { performance?: { score?: unknown } } };
  })?.lighthouseResult?.categories?.performance?.score;
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  return Math.round(score * 100);
}

/** Extract the page screenshot the PSI/Lighthouse response embeds (a data: URI), or null. */
export function parsePsiScreenshot(json: unknown): string | null {
  const data = (json as {
    lighthouseResult?: { audits?: Record<string, { details?: { data?: unknown } }> };
  })?.lighthouseResult?.audits?.["final-screenshot"]?.details?.data;
  return typeof data === "string" && data.startsWith("data:") ? data : null;
}
