export interface RankMoveRow {
  site: string;
  position: number | null;
  prevPosition: number | null;
}

/** Net keyword improvements per site (lower position = better); returns the best site. */
export function topRankingMover(rows: RankMoveRow[]): { site: string; net: number } | null {
  const bySite = new Map<string, number>();
  for (const r of rows) {
    if (r.position == null || r.prevPosition == null) continue;
    const delta = r.prevPosition - r.position; // positive = improved (moved to a lower number)
    bySite.set(r.site, (bySite.get(r.site) ?? 0) + Math.sign(delta));
  }
  let best: { site: string; net: number } | null = null;
  for (const [site, net] of bySite) {
    if (best === null || net > best.net) best = { site, net };
  }
  return best;
}

export interface SectionFreshness {
  section: string;
  latest: string | null; // ISO date or null
}

/** Sections with no data, or whose latest entry is older than `staleDays`. */
export function staleSections(rows: SectionFreshness[], today: string, staleDays: number): string[] {
  const todayMs = Date.parse(today);
  const out: string[] = [];
  for (const r of rows) {
    if (!r.latest) {
      out.push(r.section);
      continue;
    }
    const ageDays = (todayMs - Date.parse(r.latest)) / 86_400_000;
    if (ageDays > staleDays) out.push(r.section);
  }
  return out;
}

export interface ScorePoint {
  date: string;
  score: number | null;
}

/** Direction of the latest period vs the previous, over valid points. */
export function trendDirection(points: ScorePoint[]): {
  dir: "up" | "down" | "flat" | "n/a";
  delta: number | null;
} {
  const valid = points
    .filter((p): p is { date: string; score: number } => typeof p.score === "number")
    .sort((a, b) => a.date.localeCompare(b.date));
  if (valid.length < 2) return { dir: "n/a", delta: null };
  const last = valid[valid.length - 1].score;
  const prev = valid[valid.length - 2].score;
  const delta = last - prev;
  return { dir: delta > 0 ? "up" : delta < 0 ? "down" : "flat", delta };
}
