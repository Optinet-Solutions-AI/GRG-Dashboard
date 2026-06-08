"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function toPos(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (s === "" || /not in top/i.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

export async function addRankingWeek(siteId: string, _prev: { error?: string } | undefined, formData: FormData) {
  await requireAdmin();
  const weekDate = String(formData.get("week_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekDate)) return { error: "Pick a valid date." };

  // Cells are named pos__<keywordId>__<countryId>
  const rows: [string, string, string, number | null][] = [];
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^pos__([0-9a-f-]+)__([0-9a-f-]+)$/);
    if (m) rows.push([weekDate, m[1], m[2], toPos(value)]);
  }
  if (rows.length === 0) return { error: "No positions submitted." };

  const supabase = await createServerSupabaseClient();
  // batch upsert
  const payload = rows.map(([week_date, keyword_id, country_id, position]) => ({
    week_date, site_id: siteId, country_id, keyword_id, position,
  }));
  const { error } = await supabase.from("rankings").upsert(payload, { onConflict: "week_date,site_id,country_id,keyword_id" });
  if (error) return { error: error.message };
  revalidatePath("/ranking");
  return { error: undefined };
}
