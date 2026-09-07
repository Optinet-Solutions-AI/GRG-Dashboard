// Should the dashboard ask the tracker for a fresh rank check?
//
// The import side (ingest-week) is read-only and cheap, so it can run daily. Kicking a
// sweep is the expensive half: one call re-checks every domain in the panel project
// (~2093 keywords, single-threaded at ~7s each = several hours), so it must fire on a
// weekly cadence and never on every invocation.
//
// Pure on purpose: the cron route and the admin button share this one rule.

import { parseCheckedAt } from "./bpn-week";

export type SweepDecision = { trigger: boolean; reason: string };

/** A week, minus a day of slack so a cron that slips an hour still refreshes. */
export const STALE_AFTER_HOURS = 6 * 24;

export function shouldTriggerSweep(opts: {
  /** `last_checked` for the site from the tracker's domain registry (panel-local time). */
  lastChecked: string | null;
  now: Date;
  staleAfterHours?: number;
}): SweepDecision {
  const staleAfter = opts.staleAfterHours ?? STALE_AFTER_HOURS;
  if (!opts.lastChecked) {
    return { trigger: true, reason: "the tracker has no check on record for this site" };
  }
  const at = parseCheckedAt(opts.lastChecked);
  if (!Number.isFinite(at)) {
    return { trigger: true, reason: `unreadable last_checked "${opts.lastChecked}"` };
  }
  const ageHours = (opts.now.getTime() - at) / 3_600_000;
  // A negative age means the panel clock is ahead of ours, not that a check is due.
  if (ageHours < 0) {
    return { trigger: false, reason: "last check is in the future (panel clock skew) — treating as fresh" };
  }
  if (ageHours >= staleAfter) {
    return {
      trigger: true,
      reason: `last check was ${Math.round(ageHours)}h ago (stale after ${staleAfter}h)`,
    };
  }
  return {
    trigger: false,
    reason: `last check was ${Math.round(ageHours)}h ago — still fresh (stale after ${staleAfter}h)`,
  };
}
