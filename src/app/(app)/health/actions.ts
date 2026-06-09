"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadScreenshot } from "@/lib/storage";

const FIELDS = ["domain_rating", "referring_domains", "total_visitors", "organic_traffic", "organic_keywords"] as const;

export async function updateHealthNumbers(id: string, _prev: { error?: string } | undefined, formData: FormData) {
  await requireAdmin();
  if (!id) return { error: "Missing id." };
  const patch: Record<string, number | null | string> = {};
  for (const f of FIELDS) {
    const raw = String(formData.get(f) ?? "").trim();
    if (raw === "") { patch[f] = null; continue; }
    const n = Number(raw);
    if (Number.isNaN(n)) return { error: `${f} must be a number` };
    patch[f] = n;
  }
  const shot = formData.get("screenshot");
  if (shot instanceof File && shot.size > 0) {
    const ext = (shot.type === "image/png" ? "png" : shot.type === "image/jpeg" ? "jpg" : "png");
    try {
      patch.screenshot_path = await uploadScreenshot(`health/${id}.${ext}`, shot);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Image upload failed." };
    }
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("health_snapshots").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/health");
  return { error: undefined };
}

export async function addHealthPeriod(siteId: string, _prev: { error?: string } | undefined, formData: FormData) {
  await requireAdmin();
  if (!siteId) return { error: "Missing site." };
  const date = String(formData.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a valid date." };

  const record: Record<string, number | null | string> = { site_id: siteId, date };
  for (const f of FIELDS) {
    const raw = String(formData.get(f) ?? "").trim();
    if (raw === "") { record[f] = null; continue; }
    const n = Number(raw);
    if (Number.isNaN(n)) return { error: `${f} must be a number` };
    record[f] = n;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("health_snapshots")
    .upsert(record, { onConflict: "site_id,date" })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const shot = formData.get("screenshot");
  if (shot instanceof File && shot.size > 0) {
    const ext = shot.type === "image/jpeg" ? "jpg" : "png";
    try {
      const path = await uploadScreenshot(`health/${data.id}.${ext}`, shot);
      await supabase.from("health_snapshots").update({ screenshot_path: path }).eq("id", data.id);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Image upload failed." };
    }
  }
  revalidatePath("/health");
  return { error: undefined };
}
