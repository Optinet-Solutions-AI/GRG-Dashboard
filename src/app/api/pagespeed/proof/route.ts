import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseProofRequest } from "@/lib/pagespeed/proof-upload";

/**
 * Receive one PageSpeed proof screenshot from the capture job.
 *
 * The capture needs a real browser, which this deployment cannot run, so it runs elsewhere
 * — and the point of this route is that "elsewhere" does not need the database key. It is
 * authorised by CRON_SECRET, the same shared secret the scheduled routes use, and it can do
 * exactly one thing: attach today's report image and its scores to a tracked URL.
 *
 * Two decisions worth keeping:
 *   - The date is the SERVER's, never the caller's, so a job with a wrong clock (or a
 *     replayed request) cannot rewrite an older day's card.
 *   - The storage path is built here from the URL's row id. The caller does not get to
 *     name a file in the bucket.
 */
export const maxDuration = 30;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function authorised(request: Request, secret: string | undefined): boolean {
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Which URLs the capture should visit. The job has no database key, so without this it
 * would need its own copy of the URL list — a second place to keep in step, which is how
 * configuration quietly drifts.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!authorised(request, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await db
    .from("pagespeed_urls")
    .select("url, label")
    .eq("active", true)
    .order("sort_order");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, urls: data ?? [] });
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (!authorised(request, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body is not valid JSON." }, { status: 400 });
  }

  const parsed = parseProofRequest(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const { url, strategy, scores, image } = parsed.value;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Only a URL already tracked here can be written to. An unknown one is a mistake in the
  // job's configuration, and saying so beats silently creating rows nothing displays.
  const { data: urlRow, error: urlErr } = await db
    .from("pagespeed_urls")
    .select("id")
    .eq("url", url)
    .eq("active", true)
    .maybeSingle();
  if (urlErr) return NextResponse.json({ ok: false, error: urlErr.message }, { status: 500 });
  if (!urlRow) return NextResponse.json({ ok: false, error: `No active tracked URL matches ${url}.` }, { status: 404 });

  const date = todayUtc();
  const path = `pagespeed/${urlRow.id}-${strategy}-report-${date}.png`;
  const up = await db.storage.from("screenshots").upload(path, image, { contentType: "image/png", upsert: true });
  if (up.error) return NextResponse.json({ ok: false, error: up.error.message }, { status: 500 });

  const patch: Record<string, unknown> = {
    pagespeed_url_id: urlRow.id,
    date,
    [`${strategy}_screenshot_path`]: path,
    [`${strategy}_score`]: scores.performance,
    [`${strategy}_accessibility`]: scores.accessibility,
    [`${strategy}_best_practices`]: scores.bestPractices,
    [`${strategy}_seo`]: scores.seo,
  };

  // Mobile and desktop arrive as two requests; the second has to land on the row the first
  // made, or the day gets two half-filled cards.
  const { data: existing } = await db
    .from("pagespeed_entries")
    .select("id")
    .eq("pagespeed_url_id", urlRow.id)
    .eq("date", date)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (existing ?? [])[0];

  const { error: writeErr } = row
    ? await db.from("pagespeed_entries").update(patch).eq("id", row.id)
    : await db.from("pagespeed_entries").insert(patch);
  if (writeErr) return NextResponse.json({ ok: false, error: writeErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, date, strategy, path, bytes: image.length });
}
