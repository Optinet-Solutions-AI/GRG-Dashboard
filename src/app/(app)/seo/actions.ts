"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadScreenshot } from "@/lib/storage";
import { buildEntryRecord, SEO_FIELDS } from "@/lib/entries/entry-fields";
import { duplicateDateMessage } from "@/lib/entries/errors";

type State = { error?: string } | undefined;

/** Attach an optional screenshot to a just-written row. */
async function attachScreenshot(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  id: string,
  shot: FormDataEntryValue | null,
): Promise<string | null> {
  if (!(shot instanceof File) || shot.size === 0) return null;
  const ext = shot.type === "image/jpeg" ? "jpg" : "png";
  try {
    const path = await uploadScreenshot(`seo/${id}.${ext}`, shot, supabase);
    await supabase.from("seo_scores").update({ screenshot_path: path }).eq("id", id);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Image upload failed.";
  }
}

export async function addSeoPeriod(siteId: string, _prev: State, formData: FormData): Promise<State> {
  await requireAdmin();
  if (!siteId) return { error: "Missing site." };

  // SEO_FIELDS is shared with updateSeoPeriod, so add and edit validate identically:
  // score is a decimal percentage, the test tallies are whole counts.
  const built = buildEntryRecord(SEO_FIELDS, (n) => formData.get(n) as string | null);
  if (!built.ok) return { error: built.error };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("seo_scores")
    .upsert({ site_id: siteId, ...built.record }, { onConflict: "site_id,date" })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const shotErr = await attachScreenshot(supabase, data.id, formData.get("screenshot"));
  if (shotErr) return { error: shotErr };

  revalidatePath("/seo");
  return { error: undefined };
}

/** Edit an existing SEO entry — its date included. */
export async function updateSeoPeriod(id: string, _prev: State, formData: FormData): Promise<State> {
  await requireAdmin();
  if (!id) return { error: "Missing entry." };

  const built = buildEntryRecord(SEO_FIELDS, (n) => formData.get(n) as string | null);
  if (!built.ok) return { error: built.error };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("seo_scores").update(built.record).eq("id", id);
  // seo_scores has UNIQUE (site_id, date): moving an entry onto a date this site
  // already has would otherwise surface as a raw Postgres constraint error.
  if (error) return { error: duplicateDateMessage(error, "SEO entry") };

  const shotErr = await attachScreenshot(supabase, id, formData.get("screenshot"));
  if (shotErr) return { error: shotErr };

  revalidatePath("/seo");
  return { error: undefined };
}

export async function deleteSeoPeriod(id: string): Promise<void> {
  await requireAdmin();
  if (!id) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from("seo_scores").delete().eq("id", id);
  revalidatePath("/seo");
}
