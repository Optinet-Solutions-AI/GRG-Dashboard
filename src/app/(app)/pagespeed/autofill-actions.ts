"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { pageSpeedInsights } from "@/lib/sources/pagespeed-insights";

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
  const mobile = results.find((r) => r.strategy === "mobile")?.score ?? null;
  const desktop = results.find((r) => r.strategy === "desktop")?.score ?? null;
  if (mobile === null && desktop === null) {
    return { error: "PSI returned no scores (rate-limited or URL unreachable)." };
  }

  const { error: e2 } = await supabase.from("pagespeed_entries").upsert(
    { pagespeed_url_id: pagespeedUrlId, date: todayLocal(), mobile_score: mobile, desktop_score: desktop },
    { onConflict: "pagespeed_url_id,date" },
  );
  if (e2) return { error: e2.message };
  revalidatePath("/pagespeed");
  return { ok: true };
}
