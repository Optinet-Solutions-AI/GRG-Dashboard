/**
 * How many backlinks were built for each keyword.
 *
 * The keyword is the sheet's anchor text, typed in by hand per row, so the same keyword
 * arrives with stray spaces or a different case. Grouping on the raw cell would split one
 * keyword's links across two lines of the panel and understate both.
 */
/** Keyword text as typed, tidied enough that two spellings of one keyword meet. */
export function tidyKeyword(anchor: string | null): string {
  return (anchor ?? "").trim().replace(/\s+/g, " ");
}

/** The grouping key: `tidyKeyword` case-folded. Not for display. */
export function keywordKey(anchor: string | null): string {
  return tidyKeyword(anchor).toLowerCase();
}

export function tallyByKeyword(rows: { anchor_text: string | null }[]): { label: string; count: number }[] {
  const byKey = new Map<string, { label: string; count: number }>();
  for (const { anchor_text } of rows) {
    const keyword = tidyKeyword(anchor_text);
    if (!keyword) continue;
    const key = keywordKey(keyword);
    const seen = byKey.get(key);
    // First spelling wins for display — the normalised key is for grouping, not for reading.
    if (seen) seen.count += 1;
    else byKey.set(key, { label: keyword, count: 1 });
  }
  // Alphabetical within a count, so the order doesn't shuffle as the sheet is edited.
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
