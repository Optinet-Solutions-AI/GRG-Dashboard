"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createBpnClient } from "@/lib/rankings/bpn-client";
import { refreshRankings, type SweepMode } from "@/lib/rankings/refresh";

export type SyncResult = { ok?: boolean; message?: string; error?: string; runId?: number };

function describe(outcome: Awaited<ReturnType<typeof refreshRankings>>): string {
  const parts: string[] = [];
  for (const r of outcome.imports) {
    const site = r.site.replace(/^gulfrecoverygroup/, "");
    if (r.skipped) {
      parts.push(`${site}: nothing stored — ${r.skipped}`);
      continue;
    }
    const cover = r.coverage == null ? "" : ` (${Math.round(r.coverage * 100)}% coverage${r.partial ? ", partial" : ""})`;
    parts.push(`${site}: ${r.written} pairs for week ${r.week} — ${r.ranked} ranking${cover}`);
  }
  const s = outcome.sweep;
  if (s) {
    if (s.triggered && s.run) {
      const jobs = s.run.total_jobs ? `, ${s.run.total_jobs} keywords` : "";
      parts.push(
        s.run.status === "already_running"
          ? `Rank check already running (run ${s.run.run_id}${jobs}).`
          : `Rank check queued — run ${s.run.run_id}, status ${s.run.status}${jobs}. It takes a few hours; the daily sync imports it as it lands.`,
      );
    } else {
      parts.push(`No rank check queued — ${s.reason}.`);
    }
  }
  return parts.join(" · ");
}

/** Same code path the daily cron runs: import the current week, queue a sweep if stale. */
export async function syncRankings(mode: SweepMode = "auto"): Promise<SyncResult> {
  await requireAdmin();
  try {
    const outcome = await refreshRankings({ sweep: mode });
    revalidatePath("/ranking");
    return { ok: true, message: describe(outcome), runId: outcome.sweep?.run?.run_id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ranking sync failed." };
  }
}

/** Progress of a queued sweep, so the button can be pressed again for an update. */
export async function sweepProgress(runId: number): Promise<SyncResult> {
  await requireAdmin();
  try {
    const run = await createBpnClient({}).runStatus(runId);
    const total = run.total_jobs ?? 0;
    const done = run.done ?? 0;
    const pct = total ? ` (${Math.round((done / total) * 100)}%)` : "";
    const failed = run.failed ? `, ${run.failed} failed` : "";
    return {
      ok: true,
      runId,
      message:
        run.status === "complete"
          ? `Run ${runId} complete: ${done} of ${total} keywords checked${failed}. Press Sync now to import it.`
          : `Run ${runId} ${run.status}: ${done} of ${total} checked${pct}${failed}.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the run status." };
  }
}
