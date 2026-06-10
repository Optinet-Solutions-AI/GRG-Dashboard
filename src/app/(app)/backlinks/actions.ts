"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { syncBacklinksFromSheet } from "@/lib/backlinks/sync";

export async function addBacklink(_prev: { error?: string } | undefined, formData: FormData) {
  await requireAdmin();
  const site_id = String(formData.get("site_id") ?? "");
  const date = String(formData.get("date") ?? "").trim();
  if (!site_id) return { error: "Pick a site." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a valid date." };
  const row = {
    site_id,
    date,
    source_site: String(formData.get("source_site") ?? "").trim() || null,
    source_url: String(formData.get("source_url") ?? "").trim() || null,
    anchor_text: String(formData.get("anchor_text") ?? "").trim() || null,
    target_url: String(formData.get("target_url") ?? "").trim() || null,
  };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("backlinks").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/backlinks");
  return { error: undefined };
}

export async function deleteBacklink(id: string): Promise<void> {
  await requireAdmin();
  if (!id) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from("backlinks").delete().eq("id", id);
  revalidatePath("/backlinks");
}

export async function addBacklinkSummary(_prev: { error?: string } | undefined, formData: FormData) {
  await requireAdmin();
  const site_id = String(formData.get("site_id") ?? "");
  const sub_url = String(formData.get("sub_url") ?? "").trim();
  const period_date = String(formData.get("period_date") ?? "").trim();
  const countRaw = String(formData.get("backlink_count") ?? "").trim();
  if (!site_id) return { error: "Pick a site." };
  if (!sub_url) return { error: "Enter a sub-page URL." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period_date)) return { error: "Pick a valid period date." };
  const backlink_count = parseInt(countRaw, 10);
  if (!Number.isInteger(backlink_count) || backlink_count < 0) return { error: "Count must be a non-negative number." };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("backlink_summary")
    .upsert({ site_id, sub_url, backlink_count, period_date }, { onConflict: "site_id,sub_url,period_date" });
  if (error) return { error: error.message };
  revalidatePath("/backlinks");
  return { error: undefined };
}

export async function deleteBacklinkSummary(id: string): Promise<void> {
  await requireAdmin();
  if (!id) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from("backlink_summary").delete().eq("id", id);
  revalidatePath("/backlinks");
}

export async function syncBacklinks(
  _prev: { ok?: boolean; message?: string; error?: string } | undefined,
  _formData: FormData,
): Promise<{ ok?: boolean; message?: string; error?: string }> {
  await requireAdmin();
  try {
    // Pass the session-based client so the admin's own RLS identity performs the
    // writes — no SUPABASE_SERVICE_ROLE_KEY needed in the Vercel env for this path.
    const supabase = await createServerSupabaseClient();
    const r = await syncBacklinksFromSheet("gulfrecoverygroup.com", supabase);
    revalidatePath("/backlinks");
    return { ok: true, message: `Synced ${r.synced} backlinks from the sheet${r.date ? ` (latest ${r.date})` : ""}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync failed." };
  }
}
