"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadScreenshot } from "@/lib/storage";

function toInt(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isInteger(n) ? n : null;
}

export async function addSeoPeriod(siteId: string, _prev: { error?: string } | undefined, formData: FormData) {
  await requireAdmin();
  if (!siteId) return { error: "Missing site." };
  const date = String(formData.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a valid date." };

  const seoScore = toInt(formData.get("seo_score"));
  if (seoScore != null && (seoScore < 0 || seoScore > 100)) return { error: "SEO score must be 0–100." };

  const record = {
    site_id: siteId,
    date,
    seo_score: seoScore,
    passed_tests: toInt(formData.get("passed_tests")),
    warnings: toInt(formData.get("warnings")),
    failed_tests: toInt(formData.get("failed_tests")),
  };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("seo_scores")
    .upsert(record, { onConflict: "site_id,date" })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const shot = formData.get("screenshot");
  if (shot instanceof File && shot.size > 0) {
    const ext = shot.type === "image/jpeg" ? "jpg" : "png";
    try {
      const path = await uploadScreenshot(`seo/${data.id}.${ext}`, shot, supabase);
      await supabase.from("seo_scores").update({ screenshot_path: path }).eq("id", data.id);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Image upload failed." };
    }
  }
  revalidatePath("/seo");
  return { error: undefined };
}
