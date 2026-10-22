/**
 * How many backlinks were built for each keyword.
 *
 * The keyword is the sheet's anchor text, typed in by hand per row, so the same keyword
 * arrives with stray spaces or a different case. Grouping on the raw cell would split one
 * keyword's links across two lines of the panel and understate both.
 */
export function tallyByKeyword(rows: { anchor_text: string | null }[]): { label: string; count: number }[] {
  const byKey = new Map<string, { label: string; count: number }>();
  for (const { anchor_text } of rows) {
    const keyword = (anchor_text ?? "").trim().replace(/\s+/g, " ");
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    const seen = byKey.get(key);
    // First spelling wins for display — the normalised key is for grouping, not for reading.
    if (seen) seen.count += 1;
    else byKey.set(key, { label: keyword, count: 1 });
  }
  // Alphabetical within a count, so the order doesn't shuffle as the sheet is edited.
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
