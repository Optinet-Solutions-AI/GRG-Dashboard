import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { refreshRankings, type SweepMode } from "@/lib/rankings/refresh";
import { runSeoAnalysis, type RunResult } from "@/lib/seo-analyzer/run";
import { kickPagespeedCapture, type PsiKick } from "@/lib/pagespeed/kick";

// Ranking automation, end to end. Two halves on purpose:
//   1. IMPORT — read whatever the tracker has already checked for the current ISO week
//      and store it authoritatively for that week (cheap, idempotent, self-healing).
//   2. SWEEP — ask the tracker for a fresh rank check, but only once the data has gone
//      stale (~6 days). A sweep re-checks every domain in the panel project (~2093
//      keywords at ~7s each, so hours), which is why it can't fire on every invocation.
//
// The route therefore runs DAILY (vercel.json): each day re-imports the current week, so
// the grid fills in as a multi-hour sweep progresses, and the sweep itself is queued once
// a week. A sweep that dies half-way is simply re-queued the next day once it ages out.
// Vercel Hobby allows 2 cron jobs per project, both already spoken for, so this route
// carries both halves rather than adding a third schedule.
//
// Manual use (the admin "Sync now" button on /ranking calls the same code path):
//   GET /api/cron/ranking?dry=1              preview: import + sweep decision, no writes
//   GET /api/cron/ranking?week=2026-08-31    target a specific ISO week (Monday)
//   GET /api/cron/ranking?sweep=0            import only, never queue a sweep
//   GET /api/cron/ranking?sweep=1            queue a sweep even if the data looks fresh
//   GET /api/cron/ranking?seo=0               skip the SEO analysis half
//   GET /api/cron/ranking?psi=0               don't kick the PageSpeed capture
//
// It also carries two secondary jobs, for the same reason it carries the sweep: Hobby gives
// a project two cron slots and both are spoken for.
//   - the computed SEO score for .org/.net (see /api/cron/seo-analysis)
//   - a daily kick of the PageSpeed capture, which runs as its own invocation because one
//     PSI pass needs ~50s of a 60s budget
// Both are isolated: if either throws, the ranking result still returns, because a ranking
// import must not fail over a secondary job.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const week = url.searchParams.get("week") ?? undefined;
  const dryRun = url.searchParams.get("dry") === "1";
  const sweepParam = url.searchParams.get("sweep");
  const sweep: SweepMode = sweepParam === "0" ? "off" : sweepParam === "1" ? "force" : "auto";

  try {
    const { imports, sweep: sweepOutcome } = await refreshRankings({ week, dryRun, sweep });
    const wrote = imports.some((r) => r.written > 0 && !r.skipped);
    if (wrote && !dryRun) revalidatePath("/ranking");

    let seo: RunResult[] | { error: string } | null = null;
    if (url.searchParams.get("seo") !== "0") {
      try {
        seo = await runSeoAnalysis({ dryRun });
        if (!dryRun && (seo as RunResult[]).some((r) => !r.skipped)) revalidatePath("/seo");
      } catch (e) {
        seo = { error: e instanceof Error ? e.message : "seo analysis failed" };
      }
    }

    // Skipped on a dry run: there is no way to preview a capture without spending it.
    let pagespeed: PsiKick | { error: string } | null = null;
    if (!dryRun && url.searchParams.get("psi") !== "0") {
      try {
        pagespeed = await kickPagespeedCapture();
      } catch (e) {
        pagespeed = { error: e instanceof Error ? e.message : "pagespeed kick failed" };
      }
    }

    // A refused week is a successful run that declined to store bad data, not an error.
    return NextResponse.json({ ok: true, dryRun, results: imports, sweep: sweepOutcome, seo, pagespeed });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "ranking ingest failed" },
      { status: 500 },
    );
  }
}
