"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { crawlSitemapPages } from "@/lib/qa/sitemap";

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

export async function refreshQaPages(
  siteId: string,
  _prev: { ok?: boolean; message?: string; error?: string } | undefined,
  _formData: FormData,
): Promise<{ ok?: boolean; message?: string; error?: string }> {
  await requireAdmin();
  if (!siteId) return { error: "Missing site." };
  const supabase = await createServerSupabaseClient();
  const site = (await supabase.from("sites").select("domain").eq("id", siteId).single()).data as { domain: string } | null;
  if (!site) return { error: "Site not found." };
  const base = /^https?:\/\//.test(site.domain) ? site.domain : `https://${site.domain}`;

  let pages: string[];
  try {
    pages = await crawlSitemapPages(base);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sitemap crawl failed." };
  }
  if (!pages.length) return { error: "No pages found in the sitemap." };

  const payload = pages.map((url, i) => {
    let label = url;
    try { label = decodeURIComponent(new URL(url).pathname) || "/"; } catch { /* keep url */ }
    return { site_id: siteId, url, label, sort_order: i + 1, active: true };
  });
  const { error } = await supabase.from("qa_pages").upsert(payload, { onConflict: "site_id,url" });
  if (error) return { error: error.message };
  revalidatePath("/qa");
  return { ok: true, message: `Synced ${pages.length} pages from the sitemap.` };
}
