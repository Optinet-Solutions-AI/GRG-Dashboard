"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { pageSpeedInsights } from "@/lib/sources/pagespeed-insights";
import { scoreFields } from "@/lib/pagespeed/entry-write";

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
  const fields = scoreFields(m, d);

  // Update the day's existing row rather than adding another one. This used to insert
  // unconditionally, which quietly undid the nightly capture: that job writes the day's row
  // WITH Google's report image, the page shows the most recent row per URL, and a later
  // auto-fill buried it behind a card that had no image. On 2026-11-11 the .com report was
  // captured at 08:58 and a 13:31 auto-fill left it orphaned in storage.
  //
  // `fields` is scores only, so refreshing the numbers leaves the image that proves them.
  const { data: existing } = await supabase
    .from("pagespeed_entries")
    .select("id")
    .eq("pagespeed_url_id", pagespeedUrlId)
    .eq("date", date)
    .order("created_at", { ascending: false })
    .limit(1);
  const todaysEntry = (existing ?? [])[0];

  const { error: e2 } = todaysEntry
    ? await supabase.from("pagespeed_entries").update(fields).eq("id", todaysEntry.id)
    : await supabase.from("pagespeed_entries").insert({ pagespeed_url_id: pagespeedUrlId, date, ...fields });
  if (e2) return { error: e2.message };
  revalidatePath("/pagespeed");
  return { ok: true };
}
