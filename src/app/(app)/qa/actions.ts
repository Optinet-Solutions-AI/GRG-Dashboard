"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function saveQaChecks(siteId: string, _prev: { error?: string } | undefined, formData: FormData) {
  await requireAdmin();
  const supabase = await createServerSupabaseClient();

  // All pages for this site, all elements → upsert every combo (checkbox present = passed).
  const [{ data: pages }, { data: elements }] = await Promise.all([
    supabase.from("qa_pages").select("id").eq("site_id", siteId),
    supabase.from("qa_elements").select("id"),
  ]);
  const now = new Date().toISOString();
  const rows: { qa_page_id: string; qa_element_id: string; passed: boolean; last_checked_at: string }[] = [];
  for (const p of (pages ?? []) as { id: string }[]) {
    for (const el of (elements ?? []) as { id: string }[]) {
      rows.push({
        qa_page_id: p.id,
        qa_element_id: el.id,
        passed: formData.get(`chk__${p.id}__${el.id}`) === "on",
        last_checked_at: now,
      });
    }
  }
  if (rows.length === 0) return { error: "Nothing to save." };
  const { error } = await supabase.from("qa_checks").upsert(rows, { onConflict: "qa_page_id,qa_element_id" });
  if (error) return { error: error.message };
  revalidatePath("/qa");
  return { error: undefined };
}
