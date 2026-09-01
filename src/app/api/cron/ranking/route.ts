import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ingestRankingWeek } from "@/lib/rankings/ingest-week";

// Weekly ranking automation. Pulls the current ISO week from the BPN rank tracker
// (read-only — it never triggers a sweep) and stores it authoritatively for that week.
// Scheduled from vercel.json; protected by CRON_SECRET when that env var is set.
//
// Manual use:
//   GET /api/cron/ranking?dry=1              preview without writing
//   GET /api/cron/ranking?week=2026-08-31    target a specific ISO week (Monday)
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const week = url.searchParams.get("week") ?? undefined;
  const dryRun = url.searchParams.get("dry") === "1";

  try {
    const results = await ingestRankingWeek({ week, dryRun });
    const wrote = results.some((r) => r.written > 0 && !r.skipped);
    if (wrote && !dryRun) revalidatePath("/ranking");
    // A refused week is a successful run that declined to store bad data, not an error.
    return NextResponse.json({ ok: true, dryRun, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "ranking ingest failed" },
      { status: 500 },
    );
  }
}
