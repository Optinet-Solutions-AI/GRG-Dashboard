import { NextResponse } from "next/server";
import { syncBacklinksFromSheet } from "@/lib/backlinks/sync";

// Scheduled (Vercel Cron) backlinks sync from the Google Sheet. Runs daily.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await syncBacklinksFromSheet();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
  }
}
