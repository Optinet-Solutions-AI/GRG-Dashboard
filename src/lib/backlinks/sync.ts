import "server-only";
import { createClient } from "@supabase/supabase-js";
import { parseBacklinkSheet } from "./parse-sheet";

// Minimal interface so we can accept either createClient() or createServerSupabaseClient().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDB = { from(table: string): any };

/**
 * Pull the public backlinks Google Sheet (CSV export) and replace the site's
 * backlinks with its current contents (the sheet is the source of truth).
 *
 * `client` — optional; pass a session-based client from a server action so that
 * the admin's own RLS identity is used (no service-role key needed in Vercel).
 * Omit when calling from a cron route (uses service-role key instead).
 */
export async function syncBacklinksFromSheet(
  siteDomain = "gulfrecoverygroup.com",
  client?: AnyDB,
): Promise<{ synced: number; date: string | null }> {
  const csvUrl = process.env.BACKLINKS_SHEET_CSV_URL;
  if (!csvUrl) throw new Error("BACKLINKS_SHEET_CSV_URL is not set.");
  const res = await fetch(csvUrl, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`Sheet fetch failed (HTTP ${res.status}).`);
  const rows = parseBacklinkSheet(await res.text());

  const db: AnyDB = client ?? createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const site = (await db.from("sites").select("id").eq("domain", siteDomain).single()).data as { id: string } | null;
  if (!site) throw new Error(`Site not found: ${siteDomain}. Check SUPABASE_SERVICE_ROLE_KEY is set in your deployment env vars.`);

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
