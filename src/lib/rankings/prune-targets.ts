import { keywordKey } from "@/lib/backlinks/keyword-tally";

/**
 * Which of a site's keyword rows no longer belong, because Ahrefs does not track them.
 *
 * The dashboard's keyword set used to be a sheet somebody kept by hand. Ahrefs now decides it,
 * which means removal as well as addition: a keyword dropped in Ahrefs, or one the old sheet
 * carried and Ahrefs never had, otherwise sits on the grid for ever as a row that will never be
 * checked. On 2026-11-23 there were 84 of those across the three sites.
 *
 * Only the keyword_targets row is removed — the rows that decide what the grid draws. Recorded
 * positions are left alone: a keyword that comes back to Ahrefs keeps its history, and deleting
 * measurements to tidy a display would be the wrong trade.
 */

/**
 * Below this many keywords in Ahrefs' reply, prune nothing.
 *
 * "Remove everything Ahrefs does not list" is only safe while the list is trustworthy. A call
 * that half-failed and returned two keywords would otherwise strip a site to two. The smallest
 * real project here holds 26, so ten is clearly broken rather than merely small.
 */
export const PRUNE_MIN_KEYWORDS = 10;

export function targetsToPrune(
  targets: Array<{ id: string; keyword: string }>,
  ahrefsKeywords: string[],
): string[] {
  const tracked = new Set((ahrefsKeywords ?? []).map((k) => keywordKey(k)).filter(Boolean));
  if (tracked.size < PRUNE_MIN_KEYWORDS) return [];
  return (targets ?? []).filter((t) => !tracked.has(keywordKey(t.keyword))).map((t) => t.id);
}
