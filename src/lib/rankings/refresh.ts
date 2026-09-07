import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBpnClient, type BpnClient, type SweepRun } from "./bpn-client";
import { ingestRankingWeek, type IngestResult } from "./ingest-week";
import { shouldTriggerSweep } from "./sweep";

export type SweepOutcome = {
  triggered: boolean;
  reason: string;
  projectId: number | null;
  lastChecked: string | null;
  run: SweepRun | null;
};

export type RefreshOutcome = {
  week: string | null;
  imports: IngestResult[];
  sweep: SweepOutcome | null;
};

export type SweepMode = "auto" | "force" | "off";

/**
 * One refresh of the ranking data, shared verbatim by the cron and the admin button so
 * the manual path can never drift from the automated one.
 *
 * Import first, then decide about a sweep: the import captures whatever the LAST sweep
 * finished, and only then do we queue the next one. Queuing is safe to repeat — the
 * tracker returns an in-flight run's id as `already_running` instead of starting a
 * second sweep — but it is the expensive half (every domain in the panel project,
 * ~7s per keyword, hours), so "auto" fires it only once the data has gone stale.
 */
export async function refreshRankings(opts: {
  week?: string;
  dryRun?: boolean;
  sweep?: SweepMode;
  now?: Date;
  db?: SupabaseClient;
  api?: BpnClient;
} = {}): Promise<RefreshOutcome> {
  const api = opts.api ?? createBpnClient({});
  const mode: SweepMode = opts.sweep ?? "auto";
  const now = opts.now ?? new Date();

  const imports = await ingestRankingWeek({
    week: opts.week,
    dryRun: opts.dryRun,
    db: opts.db,
    api,
  });
  const week = imports[0]?.week ?? opts.week ?? null;

  if (mode === "off") return { week, imports, sweep: null };

  // Freshness is judged on the sites we actually track, not the whole panel.
  const tracked = new Set(imports.map((r) => r.site.toLowerCase()));
  const registry = (await api.domains()).filter((d) => tracked.has(d.domain.toLowerCase()));
  const lastChecked =
    registry
      .map((d) => d.last_checked)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;
  // The registry carries the project id, so a sweep never needs it hard-coded here.
  const projectId = registry[0]?.project_id ?? Number(process.env.BPN_PROJECT_ID ?? 18);

  const decision =
    mode === "force"
      ? { trigger: true, reason: "forced by an explicit request" }
      : shouldTriggerSweep({ lastChecked, now });

  if (!decision.trigger) {
    return { week, imports, sweep: { triggered: false, reason: decision.reason, projectId, lastChecked, run: null } };
  }
  if (opts.dryRun) {
    return {
      week,
      imports,
      sweep: {
        triggered: false,
        reason: `DRY RUN — would queue a sweep for project ${projectId}: ${decision.reason}`,
        projectId,
        lastChecked,
        run: null,
      },
    };
  }

  const run = await api.triggerSweep({ projectId });
  return { week, imports, sweep: { triggered: true, reason: decision.reason, projectId, lastChecked, run } };
}
