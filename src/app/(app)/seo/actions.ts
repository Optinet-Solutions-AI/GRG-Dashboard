"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function toScore(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}

export async function addSeoPeriod(_prev: { error?: string } | undefined, formData: FormData) {
  await requireAdmin();
  const date = String(formData.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a valid date." };

  const bySite = new Map<string, { rankmath_analyzer: number | null; seo_homepage: number | null; health_score: number | null }>();
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^(rankmath|homepage|health)__([0-9a-f-]+)$/);
    if (!m) continue;
    const rec = bySite.get(m[2]) ?? { rankmath_analyzer: null, seo_homepage: null, health_score: null };
    if (m[1] === "rankmath") rec.rankmath_analyzer = toScore(value);
    if (m[1] === "homepage") rec.seo_homepage = toScore(value);
    if (m[1] === "health") rec.health_score = toScore(value);
    bySite.set(m[2], rec);
  }
  const payload = [...bySite.entries()].map(([site_id, v]) => ({ site_id, date, ...v }));
  if (payload.length === 0) return { error: "No scores submitted." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("seo_scores").upsert(payload, { onConflict: "site_id,date" });
  if (error) return { error: error.message };
  revalidatePath("/seo");
  return { error: undefined };
}
