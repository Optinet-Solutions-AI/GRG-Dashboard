"use client";

import { useState, useTransition } from "react";
import { syncRankings, sweepProgress, type SyncResult } from "@/app/(app)/ranking/sync-actions";

/**
 * Manual counterpart to the daily ranking cron. "Sync now" runs exactly what the cron
 * runs (import the current week, queue a rank check only if the tracker's data is
 * stale); "Force rank check" queues one regardless. A queued sweep takes hours, so the
 * run id sticks around and "Check progress" polls it on demand.
 */
export function SyncRankings({ lastChecked }: { lastChecked?: string | null }) {
  const [state, setState] = useState<SyncResult | null>(null);
  const [runId, setRunId] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<SyncResult>) =>
    start(async () => {
      const r = await fn();
      setState(r);
      if (r.runId) setRunId(r.runId);
    });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Sync from rank tracker:</span>
        <button
          type="button"
          onClick={() => run(() => syncRankings("auto"))}
          disabled={pending}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Syncing…" : "Sync now"}
        </button>
        <button
          type="button"
          onClick={() => run(() => syncRankings("force"))}
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          Force rank check
        </button>
        {runId ? (
          <button
            type="button"
            onClick={() => run(() => sweepProgress(runId))}
            disabled={pending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Check progress
          </button>
        ) : null}
        {lastChecked ? (
          <span className="text-xs text-slate-500">tracker last checked this site {lastChecked}</span>
        ) : null}
      </div>
      {/* The cron fires daily, but what a reader cares about is when their rankings
          refresh — that is the weekly rank check, Wednesday 06:00 UTC. Saying "every day"
          here read as "today's numbers are a day old", which was misleading. */}
      <p className="mt-2 text-xs text-slate-500">Runs automatically every Wednesday at 06:00 UTC.</p>
      {state?.message ? <p className="mt-2 text-sm text-slate-700">{state.message}</p> : null}
      {state?.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
    </div>
  );
}
