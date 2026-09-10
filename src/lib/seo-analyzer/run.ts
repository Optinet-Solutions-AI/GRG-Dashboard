import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { analyzeUrl, type Analysis } from "./analyze";
import { shouldRunSeoAnalysis } from "./cadence";

export type RunResult = {
  site: string;
  displayName: string;
  url: string;
  date: string;
  score: number | null;
  passed: number | null;
  warnings: number | null;
  failed: number | null;
  skipped: string | null;
};

function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Local calendar date, matching how every other entry in this app is dated. */
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** The row shape stored in seo_scores.analysis — enough to explain a score later. */
export function analysisRecord(a: Analysis) {
  return {
    url: a.url,
    analyzedAt: a.analyzedAt,
    score: a.score.score,
    earned: a.score.earned,
    possible: a.score.possible,
    checks: a.checks.map((c) => ({ id: c.id, group: c.group, label: c.label, status: c.status, weight: c.weight, detail: c.detail })),
  };
}

type SiteRow = { id: string; domain: string; display_name: string; auto_seo_analysis: boolean };

/**
 * Compute and store today's SEO score for the sites that opted in.
 *
 * Only sites with `auto_seo_analysis` are touched, which keeps the analyzer away from
 * .com — that score is Rank Math's, entered by hand, and a computed number would both
 * overwrite it and mix two scales in the same column. A site whose page can't be fetched
 * is reported as skipped rather than stored as a pile of failures.
 *
 * `onlyWhenDue` applies the every-15-days rhythm (the 1st and the 16th, matching the
 * PageSpeed snapshots) and is what the daily cron passes. The admin button leaves it off,
 * so a person can always ask for a score now.
 */
export async function runSeoAnalysis(opts: {
  siteId?: string;
  db?: SupabaseClient;
  now?: Date;
  dryRun?: boolean;
  onlyWhenDue?: boolean;
} = {}): Promise<RunResult[]> {
  const db = opts.db ?? serviceClient();
  const date = todayLocal(opts.now);

  let q = db.from("sites").select("id, domain, display_name, auto_seo_analysis").eq("active", true).order("sort_order");
  if (opts.siteId) q = q.eq("id", opts.siteId);
  const { data, error } = await q;
  if (error) throw new Error(`sites lookup failed: ${error.message}`);
  const sites = (data ?? []) as SiteRow[];
  if (!sites.length) throw new Error(opts.siteId ? "site not found" : "no active sites");

  const out: RunResult[] = [];
  for (const site of sites) {
    const url = `https://${site.domain}/`;
    const base = { site: site.domain, displayName: site.display_name, url, date, score: null, passed: null, warnings: null, failed: null };

    if (!site.auto_seo_analysis) {
      out.push({ ...base, skipped: `${site.domain} takes its SEO score from Rank Math — the analyzer is off for it` });
      continue;
    }

    // Per site, not globally: each keeps its own 15-day rhythm, so adding a site later
    // doesn't have to wait for the others' cycle.
    if (opts.onlyWhenDue) {
      const { data: lastRow } = await db
        .from("seo_scores")
        .select("date")
        .eq("site_id", site.id)
        .eq("source", "analyzer")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastRun = (lastRow as { date: string } | null)?.date ?? null;
      const decision = shouldRunSeoAnalysis({ today: date, lastRun });
      if (!decision.due) {
        out.push({ ...base, skipped: decision.reason });
        continue;
      }
    }

    let analysis: Analysis;
    try {
      analysis = await analyzeUrl(url);
    } catch (e) {
      out.push({ ...base, skipped: e instanceof Error ? e.message : "analysis failed" });
      continue;
    }

    const s = analysis.score;
    if (opts.dryRun) {
      out.push({ ...base, score: s.score, passed: s.passed, warnings: s.warnings, failed: s.failed, skipped: null });
      continue;
    }

    // Never clobber a hand-entered Rank Math row, even if a site were opted in by mistake.
    const { data: existing } = await db
      .from("seo_scores")
      .select("id, source")
      .eq("site_id", site.id)
      .eq("date", date)
      .maybeSingle();
    if (existing && (existing as { source: string }).source === "manual") {
      out.push({ ...base, skipped: `a manually entered score already exists for ${date}` });
      continue;
    }

    const record = {
      site_id: site.id,
      date,
      seo_score: s.score,
      passed_tests: s.passed,
      warnings: s.warnings,
      failed_tests: s.failed,
      source: "analyzer",
      analysis: analysisRecord(analysis),
    };
    const { error: upsertErr } = await db.from("seo_scores").upsert(record, { onConflict: "site_id,date" });
    if (upsertErr) {
      out.push({ ...base, skipped: `could not store the score: ${upsertErr.message}` });
      continue;
    }

    out.push({ ...base, score: s.score, passed: s.passed, warnings: s.warnings, failed: s.failed, skipped: null });
  }

  return out;
}
