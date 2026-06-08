/** Extract the Lighthouse performance score (0..1) from a PSI v5 response and scale to 0..100. */
export function parsePsiScore(json: unknown): number | null {
  const score = (json as {
    lighthouseResult?: { categories?: { performance?: { score?: unknown } } };
  })?.lighthouseResult?.categories?.performance?.score;
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  return Math.round(score * 100);
}
