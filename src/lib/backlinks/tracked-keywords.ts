import { keywordKey } from "./keyword-tally";

/**
 * Which backlinks were built for a keyword the site is actually rank-tracked for.
 *
 * "Tracked" means this site's own roster — the keywords in its rank-tracking sheet
 * (keyword_targets) — not any keyword the dashboard happens to hold. The keywords table is
 * shared across the three sites, so matching against all of it would count .net's links
 * towards keywords only .com is measured on, and the number would flatter every site.
 *
 * Matching is on the same key the keyword panel groups by, so a link counted under a keyword
 * there cannot vanish from the tracked view of the same page.
 */
export type TargetRow = { keywords: { text: string } | null };

export function trackedKeywordSet(targets: TargetRow[]): Set<string> {
  const set = new Set<string>();
  for (const t of targets) {
    // One keyword is targeted in several markets, so the sheet lists it once per market.
    const key = keywordKey(t.keywords?.text ?? null);
    if (key) set.add(key);
  }
  return set;
}

export function filterToTrackedKeywords<T extends { anchor_text: string | null }>(rows: T[], tracked: Set<string>): T[] {
  return rows.filter((r) => {
    const key = keywordKey(r.anchor_text);
    return key !== "" && tracked.has(key);
  });
}
