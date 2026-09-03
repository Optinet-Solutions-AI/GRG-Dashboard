/**
 * Which tracked URLs still need a PageSpeed refresh for a given day.
 *
 * A PSI pass with all four categories costs ~20-25s locally and considerably
 * more from the deployment region, so a single serverless invocation can only
 * safely handle a couple of URLs. Selecting the ones that have no entry yet
 * makes repeat invocations resume rather than redo, and `batch` keeps any one
 * invocation inside the function time limit.
 */
export function pendingPagespeedUrls<T extends { id: string }>(
  urls: T[],
  doneToday: Array<{ pagespeed_url_id: string }>,
  batch: number,
): T[] {
  if (batch <= 0) return [];
  const done = new Set(doneToday.map((d) => d.pagespeed_url_id));
  return urls.filter((u) => !done.has(u.id)).slice(0, batch);
}
