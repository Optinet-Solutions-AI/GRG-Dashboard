// Pure transforms for BPN Ranks API data -> one weekly ranking snapshot.
//
// No fetch, no DB: everything here is a pure function so the three ways this
// integration can silently corrupt the dashboard are unit-testable.
//   1. The API returns position 0 (NOT null) for "not ranking" — its own docs are
//      wrong about this. Storing 0 would render a literal "0" in the grid and
//      defeat the "lost ranking" detection, so 0 is folded to null at the edge.
//   2. `action=results` mixes freshness (latest known row per pair, from any date).
//      We ingest from `action=history` and keep only checks INSIDE the target week.
//   3. Sweeps are often partial and can fail wholesale — 2026-08-24 checked 135
//      pairs and returned 0 for every single one. sweepVerdict() refuses those.

export type BpnRow = {
  domain: string;
  keyword: string;
  country: string;
  language: string;
  position: number | null;
  checked_at: string;
};

export type WeekPair = { keyword: string; country: string; position: number | null };

export type WeekBuild = {
  weekDate: string;
  pairs: WeekPair[];
  checked: number;
  ranked: number;
  coverage: number | null;
};

export type Verdict = { write: boolean; partial: boolean; reason: string };

/** The API uses 0 for "not in results". The dashboard uses NULL. */
export function normalizePosition(position: number | null | undefined): number | null {
  if (position == null) return null;
  return position > 0 ? position : null;
}

/** "2026-09-01 05:43:55" is UTC, but Date() would read it as local time. */
function parseCheckedAt(s: string): number {
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  return Date.parse(/[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
}

/** Monday (UTC) of the ISO week containing `date`, as YYYY-MM-DD. */
export function isoWeekMonday(date: string | Date): string {
  const d = typeof date === "string" ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : new Date(date);
  const offset = (d.getUTCDay() + 6) % 7; // Mon -> 0 ... Sun -> 6
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/**
 * Collapse raw history rows into one snapshot for the week beginning `weekMonday`.
 * Pairs not checked in that window are simply absent — we never carry a stale
 * position forward, because presenting a 3-week-old rank as current is the exact
 * failure that made the manual exports misleading.
 */
export function buildWeek(rows: BpnRow[], weekMonday: string, expectedPairs?: number): WeekBuild {
  const start = Date.parse(`${weekMonday}T00:00:00Z`);
  const end = start + 7 * 24 * 60 * 60 * 1000;

  const latest = new Map<string, { row: BpnRow; at: number }>();
  for (const row of rows) {
    const at = parseCheckedAt(row.checked_at);
    if (!Number.isFinite(at) || at < start || at >= end) continue;
    const key = `${row.keyword}|${row.country}`;
    const held = latest.get(key);
    if (!held || at > held.at) latest.set(key, { row, at });
  }

  const pairs = [...latest.values()]
    .map(({ row }) => ({
      keyword: row.keyword,
      country: row.country,
      position: normalizePosition(row.position),
    }))
    .sort((a, b) => a.keyword.localeCompare(b.keyword) || a.country.localeCompare(b.country));

  return {
    weekDate: weekMonday,
    pairs,
    checked: pairs.length,
    ranked: pairs.filter((p) => p.position != null).length,
    coverage: expectedPairs && expectedPairs > 0 ? pairs.length / expectedPairs : null,
  };
}

// A sweep smaller than this can legitimately be all-zero (a couple of stragglers
// re-checked), so it isn't evidence of a broken checker.
const MIN_SAMPLE_FOR_ZERO_ALARM = 20;
const PARTIAL_COVERAGE_BELOW = 0.7;

/**
 * Decide whether a built week is trustworthy enough to store.
 * `prevRanked` = how many pairs ranked in the most recent stored week (null = no history).
 */
export function sweepVerdict(build: WeekBuild, prevRanked: number | null): Verdict {
  const partial = build.coverage != null && build.coverage < PARTIAL_COVERAGE_BELOW;

  if (build.checked === 0) {
    return { write: false, partial, reason: "no checks found in the target week" };
  }
  if (
    build.ranked === 0 &&
    build.checked >= MIN_SAMPLE_FOR_ZERO_ALARM &&
    prevRanked != null &&
    prevRanked > 0
  ) {
    return {
      write: false,
      partial,
      reason:
        `all-zero sweep: ${build.checked} pairs checked, none ranking, ` +
        `but ${prevRanked} ranked in the previous stored week — treating this as a ` +
        `failed rank check rather than a ranking collapse`,
    };
  }
  return {
    write: true,
    partial,
    reason: partial
      ? `partial week: only ${build.checked} pairs checked (${Math.round((build.coverage ?? 0) * 100)}% coverage)`
      : `ok: ${build.checked} pairs checked, ${build.ranked} ranking`,
  };
}
