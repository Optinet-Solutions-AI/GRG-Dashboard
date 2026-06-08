import { NextResponse } from "next/server";

// SEAM — weekly ranking automation. Rankings are entered manually today (Phase 3).
// To activate (see docs/automation-roadmap.md):
//   1. Implement a ranking MetricSource (DataForSEO SERP, or GSC for own verified sites).
//   2. Here: for each active site, fetch this ISO week's positions and upsert into `rankings`
//      with `week_date` = the week's Monday, matching the (week_date, site, country, keyword) unique key.
//   3. Add a Vercel Cron entry to vercel.json:
//        { "crons": [{ "path": "/api/cron/ranking", "schedule": "0 6 * * 1" }] }
//   4. Protect this route with a CRON_SECRET check before going live.
export async function GET() {
  return NextResponse.json(
    { ok: false, reason: "ranking automation not configured (manual entry active)" },
    { status: 501 },
  );
}
