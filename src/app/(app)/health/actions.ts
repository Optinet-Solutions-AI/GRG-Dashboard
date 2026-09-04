"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadScreenshot } from "@/lib/storage";
import { buildEntryRecord, HEALTH_FIELDS } from "@/lib/entries/entry-fields";
import { duplicateDateMessage } from "@/lib/entries/errors";

type State = { error?: string } | undefined;

async function screenshotPath(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  id: string,
  shot: FormDataEntryValue | null,
): Promise<string | null> {
  if (!(shot instanceof File) || shot.size === 0) return null;
  const ext = shot.type === "image/jpeg" ? "jpg" : "png";
  return uploadScreenshot(`health/${id}.${ext}`, shot, supabase);
}

/**
 * Edit an existing health snapshot — its date included. This previously validated a
 * fixed FIELDS list that omitted `date`, which is why the date wasn't editable.
 */
export async function updateHealthPeriod(id: string, _prev: State, formData: FormData): Promise<State> {
  await requireAdmin();
  if (!id) return { error: "Missing entry." };

  const built = buildEntryRecord(HEALTH_FIELDS, (n) => formData.get(n) as string | null);
  if (!built.ok) return { error: built.error };

  const supabase = await createServerSupabaseClient();
  const patch: Record<string, unknown> = { ...built.record };
  try {
    const path = await screenshotPath(supabase, id, formData.get("screenshot"));
    if (path) patch.screenshot_path = path;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Image upload failed." };
  }

  const { error } = await supabase.from("health_snapshots").update(patch).eq("id", id);
  // health_snapshots has UNIQUE (site_id, date).
  if (error) return { error: duplicateDateMessage(error, "health entry") };

  revalidatePath("/health");
  return { error: undefined };
}

export async function addHealthPeriod(siteId: string, _prev: State, formData: FormData): Promise<State> {
  await requireAdmin();
  if (!siteId) return { error: "Missing site." };

  const built = buildEntryRecord(HEALTH_FIELDS, (n) => formData.get(n) as string | null);
  if (!built.ok) return { error: built.error };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("health_snapshots")
    .upsert({ site_id: siteId, ...built.record }, { onConflict: "site_id,date" })
    .select("id")
    .single();
  if (error) return { error: duplicateDateMessage(error, "health entry") };

  try {
    const path = await screenshotPath(supabase, data.id, formData.get("screenshot"));
    if (path) await supabase.from("health_snapshots").update({ screenshot_path: path }).eq("id", data.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Image upload failed." };
  }

  revalidatePath("/health");
  return { error: undefined };
}

export async function deleteHealthPeriod(id: string): Promise<void> {
  await requireAdmin();
  if (!id) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from("health_snapshots").delete().eq("id", id);
  revalidatePath("/health");
}
