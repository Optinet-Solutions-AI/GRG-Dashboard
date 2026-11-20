import { NextResponse } from "next/server";
import { runDiscovery } from "@/lib/discovery/run";

/**
 * The monthly "other ranking keywords" pull.
 *
 * Separate from the ranking cron on purpose: that one is free and runs weekly, this one SPENDS
 * Ahrefs units and runs once a month. Mixing them would mean every weekly run sat one bug away
 * from spending money.
 *
 * It is never on a schedule here — Vercel's two Hobby cron slots are taken, and a scheduled
 * route that spends units is exactly the thing to keep deliberate. The monthly GitHub workflow
 * calls it, and `?dry=1` reports what it would buy without buying it.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const result = await runDiscovery({ dryRun });
    return NextResponse.json(result, { status: result.ok || dryRun ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "discovery failed" }, { status: 500 });
  }
}
