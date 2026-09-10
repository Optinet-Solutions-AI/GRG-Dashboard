// When is a site due for a computed SEO score?
//
// Asked for explicitly: every 15 days, on the same rhythm as the PageSpeed captures
// (the 1st and the 16th). Running it daily worked but wrote two rows a day — ~730 cards a
// year on /seo, nearly all identical — which buries the changes that matter.
//
// Anchored to calendar days rather than "15 days since the last run" so the snapshots
// stay on predictable dates that line up with the PageSpeed ones and with reporting.
// The overdue rule is the safety net: Hobby crons drift and can miss a day outright, and
// a fixed-day-only rule would then skip a full half-month.

export type CadenceDecision = { due: boolean; reason: string };

/** The 1st and the 16th — two snapshots a month, ~15 days apart. */
export const ANCHOR_DAYS = [1, 16];

/** Run anyway once the last stored score is this old, so a missed anchor self-heals. */
export const MAX_GAP_DAYS = 15;

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Number.POSITIVE_INFINITY;
  return Math.round((to - from) / 86_400_000);
}

export function shouldRunSeoAnalysis(opts: {
  /** Today's local calendar date, YYYY-MM-DD. */
  today: string;
  /** Date of the most recent stored computed score for this site, or null if none. */
  lastRun: string | null;
  anchorDays?: number[];
  maxGapDays?: number;
}): CadenceDecision {
  const anchors = opts.anchorDays ?? ANCHOR_DAYS;
  const maxGap = opts.maxGapDays ?? MAX_GAP_DAYS;
  const day = Number(opts.today.slice(8, 10));

  if (!opts.lastRun) {
    return { due: true, reason: "no computed score stored yet" };
  }
  if (opts.lastRun === opts.today) {
    return { due: false, reason: `already scored today (${opts.today})` };
  }

  const age = daysBetween(opts.lastRun, opts.today);
  if (anchors.includes(day)) {
    return { due: true, reason: `day ${day} of the month is a scheduled snapshot (last was ${opts.lastRun})` };
  }
  if (age >= maxGap) {
    return {
      due: true,
      reason: `last score is ${age} days old, past the ${maxGap}-day limit — a scheduled day was missed (${opts.lastRun})`,
    };
  }
  return {
    due: false,
    reason: `not due — last scored ${opts.lastRun} (${age} days ago); next on day ${anchors.find((d) => d > day) ?? anchors[0]}`,
  };
}
