// Should the dashboard ask the tracker for a fresh rank check?
//
// The import side (ingest-week) is read-only and cheap, so it can run daily. Kicking a
// sweep is the expensive half: one call re-checks every domain in the panel project
// (~2093 keywords, single-threaded at ~7s each = several hours), so it must fire on a
// weekly cadence and never on every invocation.
//
// Pure on purpose: the cron route and the admin button share this one rule.

import { parseCheckedAt } from "./bpn-week";
import { weeklyAnchor } from "@/lib/schedule/cycle";

export type SweepDecision = { trigger: boolean; reason: string };

/**
 * The weekly slot for a fresh rank check: Wednesday 06:00 UTC.
 *
 * A fixed anchor rather than "6 days since the last check", so the sweep lands on a
 * predictable day for reporting. The rule compares the last check against the most recent
 * anchor, which means a Wednesday the cron couldn't serve is picked up on the Thursday
 * instead of being skipped until the following week — the daily cron keeps asking.
 */
export const SWEEP_WEEKDAY_UTC = 3; // Wednesday
export const SWEEP_HOUR_UTC = 6;

/** Retained as the ceiling for a tracker that has gone quiet for longer than a week. */
export const STALE_AFTER_HOURS = 6 * 24;

/**
 * Sweeps die half-way — 2026-09-01 stopped at 89 of 144 pairs, the next one at 11 — and
 * a dead sweep leaves last_checked looking recent, so the time rule alone would sit on a
 * near-empty week for a full six days. Below this coverage we retry early.
 */
export const COVERAGE_FLOOR = 0.7;

/**
 * …but only once the last check is this old, which is what keeps the retry from firing
 * while a multi-hour sweep is still working through the queue (and bounds a genuinely
 * thin week to a retry every couple of days rather than a full sweep every night).
 */
export const COVERAGE_RETRY_AFTER_HOURS = 48;

export function shouldTriggerSweep(opts: {
  /** `last_checked` for the site from the tracker's domain registry (panel-local time). */
  lastChecked: string | null;
  now: Date;
  staleAfterHours?: number;
  /** Coverage of the week just imported (null when there's no previous week to compare). */
  coverage?: number | null;
  coverageFloor?: number;
  coverageRetryAfterHours?: number;
  sweepWeekday?: number;
  sweepHourUtc?: number;
}): SweepDecision {
  const staleAfter = opts.staleAfterHours ?? STALE_AFTER_HOURS;
  const floor = opts.coverageFloor ?? COVERAGE_FLOOR;
  const retryAfter = opts.coverageRetryAfterHours ?? COVERAGE_RETRY_AFTER_HOURS;
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
  // The weekly slot: due when the last check predates the most recent Wednesday 06:00 UTC.
  const anchor = weeklyAnchor(opts.now, opts.sweepWeekday ?? SWEEP_WEEKDAY_UTC, opts.sweepHourUtc ?? SWEEP_HOUR_UTC);
  if (at < anchor) {
    return {
      trigger: true,
      reason:
        `no rank check since the weekly slot (${new Date(anchor).toISOString().slice(0, 16)}Z) — ` +
        `last was ${Math.round(ageHours)}h ago`,
    };
  }
  if (ageHours >= staleAfter) {
    return {
      trigger: true,
      reason: `last check was ${Math.round(ageHours)}h ago (stale after ${staleAfter}h)`,
    };
  }
  if (opts.coverage != null && opts.coverage < floor && ageHours >= retryAfter) {
    return {
      trigger: true,
      reason:
        `the stored week covers only ${Math.round(opts.coverage * 100)}% of the tracked pairs ` +
        `and the last check was ${Math.round(ageHours)}h ago — retrying the sweep rather than ` +
        `waiting out the ${staleAfter}h window`,
    };
  }
  const thin =
    opts.coverage != null && opts.coverage < floor
      ? ` (week is thin at ${Math.round(opts.coverage * 100)}%, retrying after ${retryAfter}h)`
      : "";
  return {
    trigger: false,
    reason:
      `already checked since the weekly slot (${new Date(anchor).toISOString().slice(0, 16)}Z) — ` +
      `last was ${Math.round(ageHours)}h ago${thin}`,
  };
}
