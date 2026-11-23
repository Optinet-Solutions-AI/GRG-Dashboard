/**
 * Which keywords any site still tracks.
 *
 * The keywords table is shared by the three sites and only ever grew: every CSV import,
 * every hand-typed candidate and every since-dropped phrase left a row behind. On
 * 2026-11-23 it held 410 rows while the three sites between them tracked 85. The ranking
 * grid is drawn from keyword_targets, so it was never affected — but the editors read the
 * table directly, and listed all 410.
 *
 * The rows stay: they carry recorded positions, and a keyword Ahrefs picks up again should
 * keep its history. They are simply not offered for editing while nothing measures them.
 */
export function keywordsTrackedBySomeSite<T extends { id: string }>(
  keywords: T[],
  targets: Array<{ keyword_id: string }> | null | undefined,
): T[] {
  const tracked = new Set((targets ?? []).map((t) => t.keyword_id));
  // An empty sheet means the read failed or the roster has not been set up yet. Hiding
  // every keyword in that case would read as data loss, so fall back to showing them all.
  if (tracked.size === 0) return keywords;
  return keywords.filter((k) => tracked.has(k.id));
}
