import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pageSpeedInsights } from "@/lib/sources/pagespeed-insights";
import { uploadImageBuffer } from "@/lib/storage";

// Scheduled (Vercel Cron) PageSpeed refresh for every active URL. Runs ~every 15 days.
export const maxDuration = 60;

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataUriToImage(uri: string): { buffer: Buffer; contentType: string; ext: string } | null {
  const m = uri.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!m) return null;
  const ext = m[1].includes("png") ? "png" : "jpg";
  return { buffer: Buffer.from(m[2], "base64"), contentType: m[1], ext };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: urls } = await db.from("pagespeed_urls").select("id, url").eq("active", true).order("sort_order");

  const date = todayLocal();
  let updated = 0;
  for (const u of ((urls ?? []) as Array<{ id: string; url: string }>)) {
    const results = await pageSpeedInsights.fetchScores(u.url);
    const m = results.find((r) => r.strategy === "mobile");
    const d = results.find((r) => r.strategy === "desktop");
    if (m?.score == null && d?.score == null) continue;
    const record: Record<string, string | number | null> = {
      pagespeed_url_id: u.id, date,
      mobile_score: m?.score ?? null, mobile_accessibility: m?.accessibility ?? null, mobile_best_practices: m?.bestPractices ?? null, mobile_seo: m?.seo ?? null,
      desktop_score: d?.score ?? null, desktop_accessibility: d?.accessibility ?? null, desktop_best_practices: d?.bestPractices ?? null, desktop_seo: d?.seo ?? null,
    };
    for (const [strategy, result] of [["mobile", m], ["desktop", d]] as const) {
      const img = result?.screenshot ? dataUriToImage(result.screenshot) : null;
      if (!img) continue;
      try {
        record[`${strategy}_screenshot_path`] = await uploadImageBuffer(`pagespeed/${u.id}-${strategy}-${date}.${img.ext}`, img.buffer, img.contentType);
      } catch { /* keep scores even if the screenshot upload fails */ }
    }
    await db.from("pagespeed_entries").upsert(record, { onConflict: "pagespeed_url_id,date" });
    updated++;
  }
  return NextResponse.json({ ok: true, date, updated });
}
