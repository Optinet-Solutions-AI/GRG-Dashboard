import { keywordKey } from "@/lib/backlinks/keyword-tally";

/**
 * Turning Ahrefs' organic-keywords rows into the list the client sees.
 *
 * The question this answers is "what do the sites rank for that nobody chose to watch", so
 * anything already tracked is removed — a keyword that appears in both places belongs on the
 * rankings grid, not here, and showing it twice invites the two numbers to disagree.
 */
export type DiscoveryRow = {
  keyword: string;
  countryCode: string;
  position: number;
  url: string;
  volume: number | null;
};

export type MarkedRow = DiscoveryRow & { isNew: boolean };

type ApiRow = {
  keyword?: string | null;
  keyword_country?: string | null;
  best_position?: number | null;
  best_position_url?: string | null;
  volume?: number | null;
};

/** The month a pull belongs to. Cycles are monthly, so NEW is a comparison against last month. */
export function cycleOf(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function toDiscoveryRows(rows: ApiRow[]): DiscoveryRow[] {
  const out: DiscoveryRow[] = [];
  for (const r of rows ?? []) {
    const keyword = String(r?.keyword ?? "").trim();
    const countryCode = String(r?.keyword_country ?? "").trim().toUpperCase();
    const position = r?.best_position;
    // No position is Ahrefs saying it saw nothing — not a discovery.
    if (!keyword || !countryCode || position == null) continue;
    out.push({
      keyword,
      countryCode,
      position: Number(position),
      url: String(r?.best_position_url ?? ""),
      volume: r?.volume == null ? null : Number(r.volume),
    });
  }
  return out;
}

/** Drop what the site already tracks, matched the way the rest of the dashboard matches keywords. */
export function withoutTracked(rows: DiscoveryRow[], trackedKeys: Set<string>): DiscoveryRow[] {
  return rows.filter((r) => !trackedKeys.has(keywordKey(r.keyword)));
}

/**
 * Mark what was absent from last month's list.
 *
 * Only when last month's pull actually finished. A cycle that stopped half-way is not evidence
 * that a keyword was missing, and a false NEW claims the site has just started ranking for
 * something it has ranked for all along — worse than showing no NEW at all.
 */
export function markNew(
  rows: DiscoveryRow[],
  previousKeys: Set<string>,
  opts: { previousCycleComplete: boolean },
): MarkedRow[] {
  return rows.map((r) => ({
    ...r,
    isNew: opts.previousCycleComplete && !previousKeys.has(`${r.keyword}|${r.countryCode}`),
  }));
}
