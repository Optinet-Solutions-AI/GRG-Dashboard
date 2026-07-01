"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseVolumeForm } from "@/lib/manage/volumes";

export type VolumeActionState = { error?: string; success?: boolean } | undefined;

export async function saveVolumes(_prev: VolumeActionState, formData: FormData): Promise<VolumeActionState> {
  await requireAdmin();
  const { globals, cells, errors } = parseVolumeForm(formData);
  if (errors.length) return { error: errors.join(" ") };

  const supabase = await createServerSupabaseClient();

  // GSV: per-keyword update on keywords.global_volume.
  for (const g of globals) {
    const { error } = await supabase.from("keywords").update({ global_volume: g.volume }).eq("id", g.keyword_id);
    if (error) return { error: error.message };
  }

  // SV: upsert filled cells, delete cleared ones (keeps keyword_volumes sparse).
  const toUpsert = cells.filter((c) => c.volume !== null);
  const toDelete = cells.filter((c) => c.volume === null);
  if (toUpsert.length) {
    const { error } = await supabase.from("keyword_volumes").upsert(toUpsert, { onConflict: "keyword_id,country_id" });
    if (error) return { error: error.message };
  }
  for (const c of toDelete) {
    const { error } = await supabase.from("keyword_volumes").delete().eq("keyword_id", c.keyword_id).eq("country_id", c.country_id);
    if (error) return { error: error.message };
  }

  revalidatePath("/ranking");
  revalidatePath("/manage/volumes");
  return { success: true };
}
