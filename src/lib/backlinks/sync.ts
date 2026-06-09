import "server-only";
import { createClient } from "@supabase/supabase-js";
import { parseBacklinkSheet } from "./parse-sheet";

/**
 * Pull the public backlinks Google Sheet (CSV export) and replace the site's
 * backlinks with its current contents (the sheet is the source of truth).
 * Uses the service-role key (server-only). Returns how many rows were synced.
 */
export async function syncBacklinksFromSheet(siteDomain = "gulfrecoverygroup.com"): Promise<{ synced: number; date: string | null }> {
  const url = process.env.BACKLINKS_SHEET_CSV_URL;
  if (!url) throw new Error("BACKLINKS_SHEET_CSV_URL is not set.");
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`Sheet fetch failed (HTTP ${res.status}).`);
  const rows = parseBacklinkSheet(await res.text());

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const site = (await db.from("sites").select("id").eq("domain", siteDomain).single()).data as { id: string } | null;
  if (!site) throw new Error("Site not found: " + siteDomain);

  await db.from("backlinks").delete().eq("site_id", site.id);
  if (rows.length) {
    const payload = rows.map((b) => ({
      site_id: site.id,
      date: b.date,
      source_site: b.source_site,
      source_url: b.source_url,
      anchor_text: b.anchor_text || null,
      target_url: b.target_url || null,
      indexed: b.indexed,
      status: b.status,
      remarks: b.remarks,
    }));
    const { error } = await db.from("backlinks").insert(payload);
    if (error) throw new Error(error.message);
  }
  const date = rows.map((r) => r.date).sort().at(-1) ?? null;
  return { synced: rows.length, date };
}
