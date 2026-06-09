"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { pageSpeedInsights } from "@/lib/sources/pagespeed-insights";
import { uploadImageBuffer } from "@/lib/storage";

function dataUriToImage(uri: string): { buffer: Buffer; contentType: string; ext: string } | null {
  const m = uri.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!m) return null;
  const contentType = m[1];
  const ext = contentType.includes("png") ? "png" : "jpg";
  return { buffer: Buffer.from(m[2], "base64"), contentType, ext };
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function autofillPagespeed(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
) {
  await requireAdmin();
  const pagespeedUrlId = String(formData.get("pagespeed_url_id") ?? "").trim();
  if (!pagespeedUrlId) return { error: "Pick a PageSpeed URL." };

  const supabase = await createServerSupabaseClient();
  const { data: row, error: e1 } = await supabase
    .from("pagespeed_urls")
    .select("url")
    .eq("id", pagespeedUrlId)
    .single();
  if (e1 || !row) return { error: "URL not found." };

  const results = await pageSpeedInsights.fetchScores(row.url as string);
  const m = results.find((r) => r.strategy === "mobile");
  const d = results.find((r) => r.strategy === "desktop");
  const mobile = m?.score ?? null;
  const desktop = d?.score ?? null;
  if (mobile === null && desktop === null) {
    return { error: "PSI returned no scores (rate-limited or URL unreachable)." };
  }

  const date = todayLocal();
  const record: Record<string, string | number | null> = {
    pagespeed_url_id: pagespeedUrlId,
    date,
    mobile_score: m?.score ?? null,
    mobile_accessibility: m?.accessibility ?? null,
    mobile_best_practices: m?.bestPractices ?? null,
    mobile_seo: m?.seo ?? null,
    desktop_score: d?.score ?? null,
    desktop_accessibility: d?.accessibility ?? null,
    desktop_best_practices: d?.bestPractices ?? null,
    desktop_seo: d?.seo ?? null,
  };
  // Capture Google's page-render screenshot automatically (best-effort; scores still save if upload fails).
  for (const [strategy, result] of [["mobile", m], ["desktop", d]] as const) {
    const img = result?.screenshot ? dataUriToImage(result.screenshot) : null;
    if (!img) continue;
    try {
      record[`${strategy}_screenshot_path`] = await uploadImageBuffer(
        `pagespeed/${pagespeedUrlId}-${strategy}-${date}.${img.ext}`,
        img.buffer,
        img.contentType,
      );
    } catch {
      /* keep scores even if the screenshot upload fails */
    }
  }

  const { error: e2 } = await supabase.from("pagespeed_entries").upsert(record, { onConflict: "pagespeed_url_id,date" });
  if (e2) return { error: e2.message };
  revalidatePath("/pagespeed");
  return { ok: true };
}
