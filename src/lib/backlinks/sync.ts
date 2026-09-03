import "server-only";
import { createClient } from "@supabase/supabase-js";
import { parseBacklinkSheet } from "./parse-sheet";
import { routeBacklinksBySite } from "./route-by-site";

// Minimal interface so we can accept either createClient() or createServerSupabaseClient().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDB = { from(table: string): any };

/**
 * Pull the public backlinks Google Sheet (CSV export) and replace EVERY site's
 * backlinks with its current contents (the sheet is the source of truth).
 *
 * The sheet holds links for several domains at once, so rows are routed to the
 * site their `target_url` points at. It previously assigned every row to a single
 * hardcoded site, which attributed all the .org links to .com.
 *
 * `fallbackDomain` — where rows with a blank/unrecognised target go.
 * `client` — optional; pass a session-based client from a server action so that
 * the admin's own RLS identity is used (no service-role key needed in Vercel).
 * Omit when calling from a cron route (uses service-role key instead).
 */
export async function syncBacklinksFromSheet(
  fallbackDomain = "gulfrecoverygroup.com",
  client?: AnyDB,
): Promise<{ synced: number; date: string | null; bySite: Record<string, number>; unrouted: number }> {
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

  const sites = (await db.from("sites").select("id, domain")).data as Array<{ id: string; domain: string }> | null;
  if (!sites?.length) throw new Error("No sites found. Check SUPABASE_SERVICE_ROLE_KEY is set in your deployment env vars.");
  if (!sites.some((s) => s.domain === fallbackDomain)) {
    throw new Error(`Fallback site not found: ${fallbackDomain}.`);
  }

  const { bySite, unrouted } = routeBacklinksBySite(rows, sites, fallbackDomain);
  const domainOf = new Map(sites.map((s) => [s.id, s.domain]));
  const counts: Record<string, number> = {};

  // Every site gets cleared and rewritten — including ones the sheet no longer
  // lists, so removing a link from the sheet removes it from the dashboard.
  for (const [siteId, siteRows] of bySite) {
    const del = await db.from("backlinks").delete().eq("site_id", siteId);
    if (del.error) throw new Error(del.error.message);
    if (siteRows.length) {
      const payload = siteRows.map((b) => ({
        site_id: siteId,
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
    counts[domainOf.get(siteId) ?? siteId] = siteRows.length;
  }

  const date = rows.map((r) => r.date).sort().at(-1) ?? null;
  return { synced: rows.length, date, bySite: counts, unrouted };
}
