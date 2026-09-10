import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runSeoAnalysis } from "@/lib/seo-analyzer/run";

// Computed SEO score for the sites Rank Math can't reach (.org, .net — anything with
// sites.auto_seo_analysis). .com is skipped by design: its score is Rank Math's, entered
// by hand, and must not be overwritten by a different scale.
//
// Vercel Hobby allows a project 2 cron jobs and both are taken, so nothing schedules this
// path directly — /api/cron/ranking calls the same code once a day. This route exists so
// the run can be triggered on its own (and so it can move onto its own schedule the moment
// a third slot is available).
//
//   GET /api/cron/seo-analysis?dry=1              score without storing
//   GET /api/cron/seo-analysis?due=1              respect the 15-day rhythm (what the cron does)
//   GET /api/cron/seo-analysis?site=<site_id>     just one site
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const siteId = url.searchParams.get("site") ?? undefined;
  const dryRun = url.searchParams.get("dry") === "1";

  try {
    const results = await runSeoAnalysis({ siteId, dryRun, onlyWhenDue: url.searchParams.get("due") === "1" });
    if (!dryRun && results.some((r) => !r.skipped)) revalidatePath("/seo");
    return NextResponse.json({ ok: true, dryRun, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "seo analysis failed" },
      { status: 500 },
    );
  }
}
