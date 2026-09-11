// The shared 15-day snapshot rhythm: the 1st and the 16th of each month.
//
// Both the computed SEO score and the PageSpeed captures hang off this. The rule is
// deliberately "is there a snapshot in the CURRENT cycle yet?" rather than "is today the
// 1st or the 16th?", because the second question loses data the moment a run can't happen:
// a Hobby cron that drifts or a site that's briefly unreachable would cost a full
// half-month. Asking about the cycle instead means the job simply retries tomorrow, and
// the day after, until the snapshot lands — then goes quiet until the next anchor.
//
// It also caps the work naturally: three PageSpeed URLs at ~50s each can't share one
// invocation, so the cycle lets them spill across consecutive days (1st, 2nd, 3rd) and
// then stop, instead of either cramming them into one day or capturing every day forever.

export const ANCHOR_DAYS = [1, 16];

/** The most recent anchor day on or before `today`, as YYYY-MM-DD. */
export function cycleStart(today: string, anchorDays: number[] = ANCHOR_DAYS): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  const anchors = [...anchorDays].sort((a, b) => a - b);

  const passed = anchors.filter((a) => a <= day);
  if (passed.length) {
    return `${today.slice(0, 7)}-${String(passed[passed.length - 1]).padStart(2, "0")}`;
  }
  // Before the first anchor of this month — the open cycle began last month.
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const last = anchors[anchors.length - 1];
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/**
 * The most recent weekly anchor at or before `now` — by default Wednesday 06:00 UTC.
 *
 * Used for the rank sweep, which is the expensive job (~2093 keywords, hours) and wants a
 * fixed weekly slot rather than a rolling "N days since last time". Comparing against the
 * anchor instead of the weekday means a Wednesday that couldn't run is picked up on the
 * Thursday, not skipped until the following week.
 */
export function weeklyAnchor(now: Date, weekday = 3, hourUtc = 6): number {
  const anchor = new Date(now);
  anchor.setUTCHours(hourUtc, 0, 0, 0);
  // How many days back to the wanted weekday (0 when today IS that weekday).
  const back = (anchor.getUTCDay() - weekday + 7) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - back);
  // Today is the weekday but the hour hasn't arrived yet — the open anchor is last week's.
  if (anchor.getTime() > now.getTime()) anchor.setUTCDate(anchor.getUTCDate() - 7);
  return anchor.getTime();
}

export type DueDecision = { due: boolean; reason: string; cycle: string };

/**
 * Is a snapshot still owed for the cycle `today` falls in?
 *
 * `lastRun` is the date of the most recent stored snapshot (null = never).
 */
export function isDueThisCycle(opts: {
  today: string;
  lastRun: string | null;
  anchorDays?: number[];
}): DueDecision {
  const cycle = cycleStart(opts.today, opts.anchorDays);
  if (!opts.lastRun) {
    return { due: true, reason: "nothing stored yet", cycle };
  }
  if (opts.lastRun >= cycle) {
    return {
      due: false,
      reason: `already captured on ${opts.lastRun} for the cycle beginning ${cycle}`,
      cycle,
    };
  }
  return {
    due: true,
    reason: `no snapshot yet for the cycle beginning ${cycle} (last was ${opts.lastRun})`,
    cycle,
  };
}
