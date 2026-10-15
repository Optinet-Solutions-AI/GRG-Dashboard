import type { GridRow } from "@/lib/data/ranking";

/**
 * Flag comparisons that quietly skip a week.
 *
 * `prev_position` is the position in the previous row the database holds for that
 * site/keyword/market — which is the week before only when that pair was actually checked
 * then. A market the rank checker never returned leaves no row at all, so the comparison
 * steps over the gap and lands weeks earlier: "تجميد حساب التداول" read "↓ Lost was 31" in
 * the week of 2026-10-13 against a #31 from 2026-09-21, because Saudi Arabia was missing
 * from the 10-02 export entirely. Nothing was lost that week — the position was three weeks
 * old and the cell claimed it was last week's.
 *
 * Marking it here rather than hiding it keeps the number, which is worth knowing, and lets
 * the grid date it instead of implying it is fresh.
 */
export type WeekRows<T extends GridRow = GridRow> = { week: string; rows: T[] };

export function markStaleComparisons<T extends GridRow>(
  weeks: WeekRows<T>[],
): WeekRows<T & { prev_stale: boolean }>[] {
  return weeks.map(({ week, rows }, i) => {
    // Weeks arrive newest-first, so the one that should be compared against is the next entry.
    // The oldest week on the page has none, and its comparison necessarily reaches outside the
    // window — flagging that would put a warning on every bottom row.
    const preceding = weeks[i + 1]?.week ?? null;
    return {
      week,
      rows: rows.map((r) => ({
        ...r,
        prev_stale: preceding != null && r.prev_position != null && r.prev_week != null && r.prev_week !== preceding,
      })),
    };
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-21" → "21 Sep", short enough to sit inside a grid cell. */
export function shortWeek(week: string): string {
  const [, m, d] = week.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m}`;
}
