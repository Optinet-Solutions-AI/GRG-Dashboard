import "server-only";
import { createClient } from "@supabase/supabase-js";
import { parsePageAuditCsv, parseSiteAuditCsv } from "./parse-qa-sheet";

const SHEET_ID = "1_DPHN4k7ZWT1indxQXiFdSyanuWz2SLgCC4vx_e2PyU";
const PAGE_GID = "792540578";
const SITE_GID = "0";

async function fetchCsv(gid: string): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`CSV fetch failed (HTTP ${res.status}).`);
  return res.text();
}

export async function syncQaFromSheet(siteId: string): Promise<{ pages: number; siteRows: number }> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const [pageCsv, siteCsv] = await Promise.all([fetchCsv(PAGE_GID), fetchCsv(SITE_GID)]);
  const pageRows = parsePageAuditCsv(pageCsv);
  const siteRows = parseSiteAuditCsv(siteCsv);

  await db.from("qa_page_audit").delete().eq("site_id", siteId);
  if (pageRows.length) {
    const { error } = await db.from("qa_page_audit").insert(pageRows.map((r) => ({ ...r, site_id: siteId })));
    if (error) throw new Error(`qa_page_audit insert: ${error.message}`);
  }

  await db.from("qa_site_audit").delete().eq("site_id", siteId);
  if (siteRows.length) {
    const { error } = await db.from("qa_site_audit").insert(siteRows.map((r) => ({ ...r, site_id: siteId })));
    if (error) throw new Error(`qa_site_audit insert: ${error.message}`);
  }

  return { pages: pageRows.length, siteRows: siteRows.length };
}
