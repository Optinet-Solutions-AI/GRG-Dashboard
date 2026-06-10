"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadScreenshot } from "@/lib/storage";

function toScore(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}

/** Delete a single PageSpeed record (admin). RLS allows delete only for admins. */
export async function deletePagespeedEntry(id: string, _formData: FormData) {
  await requireAdmin();
  if (!id) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from("pagespeed_entries").delete().eq("id", id);
  revalidatePath("/pagespeed");
}

export async function addPagespeedPeriod(_prev: { error?: string } | undefined, formData: FormData) {
  await requireAdmin();
  const date = String(formData.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a valid date." };

  // url ids present as score fields mobile__<id> / desktop__<id>; files mobileShot__<id>/desktopShot__<id>; host hint host__<id>
  const urlIds = new Set<string>();
  for (const key of formData.keys()) {
    const m = key.match(/^(?:mobile|desktop)__([0-9a-f-]+)$/);
    if (m) urlIds.add(m[1]);
  }
  const supabase = await createServerSupabaseClient();
  try {
    for (const id of urlIds) {
      const mobile = toScore(formData.get(`mobile__${id}`));
      const desktop = toScore(formData.get(`desktop__${id}`));
      const host = String(formData.get(`host__${id}`) ?? "site");
      const patch: Record<string, unknown> = { pagespeed_url_id: id, date, mobile_score: mobile, desktop_score: desktop };

      const mShot = formData.get(`mobileShot__${id}`);
      const dShot = formData.get(`desktopShot__${id}`);
      if (mShot instanceof File && mShot.size > 0) patch.mobile_screenshot_path = await uploadScreenshot(`pagespeed/${host}/${date}-mobile.png`, mShot);
      if (dShot instanceof File && dShot.size > 0) patch.desktop_screenshot_path = await uploadScreenshot(`pagespeed/${host}/${date}-desktop.png`, dShot);

      const { error } = await supabase.from("pagespeed_entries").upsert(patch, { onConflict: "pagespeed_url_id,date" });
      if (error) return { error: error.message };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed." };
  }
  revalidatePath("/pagespeed");
  return { error: undefined };
}
