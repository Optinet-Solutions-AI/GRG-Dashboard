"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadScreenshot } from "@/lib/storage";
import { parseDecimalField, parseIntegerField } from "@/lib/numeric";

export async function addSeoPeriod(siteId: string, _prev: { error?: string } | undefined, formData: FormData) {
  await requireAdmin();
  if (!siteId) return { error: "Missing site." };
  const date = String(formData.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a valid date." };

  // Score is a percentage -> decimals allowed (numeric(5,2)). The test tallies are
  // counts, so a fraction is rejected outright rather than silently truncated.
  const score = parseDecimalField(formData.get("seo_score"), "SEO score", { min: 0, max: 100 });
  if (!score.ok) return { error: score.error };
  const passed = parseIntegerField(formData.get("passed_tests"), "Passed", { min: 0 });
  if (!passed.ok) return { error: passed.error };
  const warnings = parseIntegerField(formData.get("warnings"), "Warnings", { min: 0 });
  if (!warnings.ok) return { error: warnings.error };
  const failed = parseIntegerField(formData.get("failed_tests"), "Failed", { min: 0 });
  if (!failed.ok) return { error: failed.error };

  const record = {
    site_id: siteId,
    date,
    seo_score: score.value,
    passed_tests: passed.value,
    warnings: warnings.value,
    failed_tests: failed.value,
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
