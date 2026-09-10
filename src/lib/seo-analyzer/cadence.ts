// When is a site due for a computed SEO score?
//
// Every 15 days, on the same rhythm as the PageSpeed captures — but expressed as "does the
// current cycle have a score yet?" rather than "is today the 1st or the 16th?". If the
// anchor day's run can't happen (a drifting Hobby cron, a site briefly unreachable), the
// job retries the next day and the day after until the score lands, instead of the site
// losing a full half-month of data. See src/lib/schedule/cycle.ts.

import { isDueThisCycle, ANCHOR_DAYS } from "@/lib/schedule/cycle";

export { ANCHOR_DAYS };
export type CadenceDecision = { due: boolean; reason: string; cycle: string };

export function shouldRunSeoAnalysis(opts: {
  /** Today's local calendar date, YYYY-MM-DD. */
  today: string;
  /** Date of the most recent stored computed score for this site, or null if none. */
  lastRun: string | null;
  anchorDays?: number[];
}): CadenceDecision {
  return isDueThisCycle({ today: opts.today, lastRun: opts.lastRun, anchorDays: opts.anchorDays });
}
