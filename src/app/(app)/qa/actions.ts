"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { crawlSitemapPages } from "@/lib/qa/sitemap";
import { syncQaFromSheet } from "@/lib/qa/sync-qa";
import { writeSiteAuditCell } from "@/lib/qa/sheets-write";
import { SITE_COL_ORDER } from "@/lib/qa/parse-qa-sheet";

export async function saveQaChecks(siteId: string, _prev: { error?: string } | undefined, formData: FormData) {
  await requireAdmin();
  const supabase = await createServerSupabaseClient();

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

/** Pull both QA sheet tabs into the DB for a site. */
export async function syncQaSheet(
  siteId: string,
  _prev: { ok?: boolean; message?: string; error?: string } | undefined,
  _formData: FormData,
): Promise<{ ok?: boolean; message?: string; error?: string }> {
  await requireAdmin();
  if (!siteId) return { error: "Missing site." };
  try {
    const supabase = await createServerSupabaseClient();
    const r = await syncQaFromSheet(siteId, supabase);
    revalidatePath("/qa");
    return { ok: true, message: `Synced ${r.pages} page rows and ${r.siteRows} site row(s) from the sheet.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync failed." };
  }
}

/** Toggle a whole-site checklist field: Done ↔ "" — and write back to Google Sheet. */
export async function updateQaSiteField(
  siteId: string,
  field: string,
  newValue: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createServerSupabaseClient();

  const { data: row } = await supabase
    .from("qa_site_audit")
    .select("sheet_row")
    .eq("site_id", siteId)
    .single();

  const { error } = await supabase
    .from("qa_site_audit")
    .update({ [field]: newValue, synced_at: new Date().toISOString() })
    .eq("site_id", siteId);
  if (error) return { error: error.message };

  const colIndex = SITE_COL_ORDER.indexOf(field);
  const sheetRow = (row as { sheet_row?: number } | null)?.sheet_row;
  if (sheetRow && colIndex >= 0) {
    await writeSiteAuditCell(sheetRow, colIndex, newValue);
  }

  revalidatePath("/qa");
  return { ok: true };
}
