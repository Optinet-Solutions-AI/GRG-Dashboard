import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pageSpeedInsights } from "@/lib/sources/pagespeed-insights";
import { mapWithLimit } from "@/lib/concurrency";
import { pendingPagespeedUrls } from "@/lib/sources/pending-urls";

// Scheduled/triggered PageSpeed refresh for the active URLs.
// Scores only — the proof screenshot of the real PSI report is captured separately
// by scripts/capture-psi-report.mjs (needs a real browser, which the cron can't run).
//
// A PSI pass with all four categories costs ~20-25s per URL. This route used to loop
// URLs sequentially, which was fine for one site but exceeded the 60s function limit
// the moment .org and .net were added (3 x ~23s).
//
// So an invocation now refreshes a bounded BATCH of URLs concurrently, picking only
// those with no entry for today. Upserts are keyed on (pagespeed_url_id, date), so
// calling it again resumes exactly where it left off and never redoes work.
//   ?probe=1    report what would run, without spending ~25s per URL
//   ?batch=N    override how many URLs this invocation handles
//   ?force=1    ignore today's existing entries and refresh anyway
export const maxDuration = 60;

const DEFAULT_BATCH = 2;
const SOFT_DEADLINE_MS = 40_000;

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const params = new URL(request.url).searchParams;
  const batch = Math.max(0, Number(params.get("batch") ?? DEFAULT_BATCH) || DEFAULT_BATCH);
  const force = params.get("force") === "1";

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: urlRows } = await db
    .from("pagespeed_urls").select("id, url").eq("active", true).order("sort_order");
  const all = (urlRows ?? []) as Array<{ id: string; url: string }>;

  const date = todayLocal();
  const { data: doneRows } = await db
    .from("pagespeed_entries").select("pagespeed_url_id").eq("date", date);
  const doneToday = force ? [] : ((doneRows ?? []) as Array<{ pagespeed_url_id: string }>);
  const todo = pendingPagespeedUrls(all, doneToday, batch);
  const remainingBefore = all.length - doneToday.length;

  if (params.get("probe") === "1") {
    return NextResponse.json({
      ok: true, probe: true, date, batch,
      tracked: all.length, doneToday: doneToday.length,
      wouldRefresh: todo.map((u) => u.url), remaining: remainingBefore,
    });
  }

  const outcomes = await mapWithLimit(
    todo,
    Math.max(1, todo.length),
    async (u) => {
      const results = await pageSpeedInsights.fetchScores(u.url);
      const m = results.find((r) => r.strategy === "mobile");
      const d = results.find((r) => r.strategy === "desktop");
      if (m?.score == null && d?.score == null) return { url: u.url, written: false };
      const { error } = await db.from("pagespeed_entries").upsert(
        {
          pagespeed_url_id: u.id, date,
          mobile_score: m?.score ?? null, mobile_accessibility: m?.accessibility ?? null, mobile_best_practices: m?.bestPractices ?? null, mobile_seo: m?.seo ?? null,
          desktop_score: d?.score ?? null, desktop_accessibility: d?.accessibility ?? null, desktop_best_practices: d?.bestPractices ?? null, desktop_seo: d?.seo ?? null,
        },
        { onConflict: "pagespeed_url_id,date" },
      );
      if (error) throw new Error(`${u.url}: ${error.message}`);
      return { url: u.url, written: true };
    },
    () => Date.now() - startedAt > SOFT_DEADLINE_MS,
  );

  const updated = outcomes.filter((o) => o.status === "done" && o.value.written).length;
  const noScores = outcomes.filter((o) => o.status === "done" && !o.value.written).length;
  const failed = outcomes.flatMap((o) => (o.status === "failed" ? [o.error] : []));
  const skipped = outcomes.filter((o) => o.status === "skipped").length;
  const remaining = Math.max(0, remainingBefore - updated - noScores);

  return NextResponse.json({
    ok: failed.length === 0,
    date,
    tracked: all.length,
    attempted: todo.length,
    updated,
    noScores,
    skipped,
    failed,
    remaining,
    complete: remaining === 0,
    tookMs: Date.now() - startedAt,
  });
}
