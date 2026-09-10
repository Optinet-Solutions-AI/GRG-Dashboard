/**
 * Which tracked URLs still need a PageSpeed refresh for the current snapshot cycle.
 *
 * A PSI pass with all four categories costs ~20-25s locally and considerably
 * more from the deployment region, so a single serverless invocation can only
 * safely handle a couple of URLs. Selecting the ones that have no entry yet
 * makes repeat invocations resume rather than redo, and `batch` keeps any one
 * invocation inside the function time limit.
 *
 * Order matters as much as the filter. Picking by sort_order handed the single slot to
 * the first URL every single run:
 * across six automated runs (2026-06-16 to 09-01) .com was captured every time and
 * .org/.net never once. With `lastCaptured` supplied the starved URL goes first —
 * never-captured, then oldest capture, with sort_order only as a tiebreak — so one
 * invocation a day rotates through every tracked URL instead of pinning the first.
 */
export function pendingPagespeedUrls<T extends { id: string }>(
  urls: T[],
  /** URLs already captured in the window the caller cares about (the current cycle). */
  alreadyCaptured: Array<{ pagespeed_url_id: string }>,
  batch: number,
  /** url id -> most recent capture date (YYYY-MM-DD), or null/absent if never captured. */
  lastCaptured?: Map<string, string | null>,
): T[] {
  if (batch <= 0) return [];
  const done = new Set(alreadyCaptured.map((d) => d.pagespeed_url_id));
  const pending = urls.filter((u) => !done.has(u.id));
  if (!lastCaptured) return pending.slice(0, batch);

  const order = new Map(urls.map((u, i) => [u.id, i]));
  return [...pending]
    .sort((a, b) => {
      const la = lastCaptured.get(a.id) ?? null;
      const lb = lastCaptured.get(b.id) ?? null;
      if (la !== lb) {
        if (la === null) return -1; // never captured is the most starved
        if (lb === null) return 1;
        return la < lb ? -1 : 1; // oldest capture first
      }
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    })
    .slice(0, batch);
}
