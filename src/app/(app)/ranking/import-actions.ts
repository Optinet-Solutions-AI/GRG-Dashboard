"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseRankingsFile, type RankingRow } from "@/lib/rankings/parse-rankings";

function minus7(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

type Result = { ok?: boolean; message?: string; error?: string };

export async function importRankings(_prev: Result | undefined, formData: FormData): Promise<Result> {
  await requireAdmin();
  const siteId = String(formData.get("site_id") ?? "");
  const file = formData.get("file");
  if (!siteId) return { error: "No site selected." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a rankings export (CSV or XLSX)." };

  let rows: RankingRow[];
  try {
    rows = await parseRankingsFile(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not parse the file." };
  }
  if (!rows.length) return { error: "No data rows found in the file." };

  const supabase = await createServerSupabaseClient();
  const { data: site } = await supabase.from("sites").select("id, domain").eq("id", siteId).single();
  if (!site) return { error: "Site not found." };
  const siteDomain = String((site as { domain: string }).domain).toLowerCase();

  // Multi-domain export (new tracker) → keep only this site's rows. Single-domain (Ahrefs) → keep all.
  const domainsInFile = new Set(rows.map((r) => r.domain).filter(Boolean));
  const siteRows = domainsInFile.size ? rows.filter((r) => r.domain === siteDomain) : rows;
  if (!siteRows.length) {
    return { error: `No rows for ${siteDomain} in this export — it lists ${domainsInFile.size} other domain(s).` };
  }

  const dates = siteRows.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const weekCur = dates.at(-1);
  if (!weekCur) return { error: "Could not read the export's update/check date." };
  const weekPrev = minus7(weekCur);

  const [{ data: kwsRaw }, { data: ctsRaw }] = await Promise.all([
    supabase.from("keywords").select("id, text, sort_order").order("sort_order"),
    supabase.from("countries").select("id, code, sort_order"),
  ]);
  const kws = (kwsRaw ?? []) as Array<{ id: string; text: string; sort_order: number | null }>;
  const cts = (ctsRaw ?? []) as Array<{ id: string; code: string; sort_order: number | null }>;
  const kwMap = new Map(kws.map((k) => [k.text.trim(), k.id]));
  const ccMap = new Map(cts.map((c) => [c.code.toUpperCase(), c.id]));
  const ccSort = new Map(cts.map((c) => [c.code.toUpperCase(), c.sort_order ?? 0]));

  // Auto-create keywords present in the export but missing from the DB (parity with the CLI importer),
  // grouped by country sort_order then text so per-country blocks stay together in the grid.
  const missing = new Map<string, number>();
  for (const r of siteRows) {
    if (!r.keyword || kwMap.has(r.keyword) || !ccMap.has(r.countryCode)) continue;
    const cs = ccSort.get(r.countryCode) ?? 9999;
    missing.set(r.keyword, Math.min(missing.get(r.keyword) ?? Infinity, cs));
  }
  let created = 0;
  if (missing.size) {
    let nextSort = kws.reduce((m, k) => Math.max(m, k.sort_order ?? 0), 0);
    const newRows = [...missing.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "ar"))
      .map(([text]) => ({ text, sort_order: ++nextSort, active: true }));
    const ins = await supabase.from("keywords").insert(newRows).select("id, text");
    if (ins.error) return { error: "Keyword insert failed: " + ins.error.message };
    for (const k of (ins.data ?? []) as Array<{ id: string; text: string }>) kwMap.set(k.text.trim(), k.id);
    created = ins.data?.length ?? 0;
  }

  // Bootstrap-only back-dating: on the first-ever import write previous+current; once history exists
  // write the current week only, so a re-import can't inject a colliding/off-cadence week.
  const { count: existingCount } = await supabase
    .from("rankings").select("id", { count: "exact", head: true }).eq("site_id", siteId);
  const hasHistory = (existingCount ?? 0) > 0;

  const payload: Array<{ week_date: string; site_id: string; country_id: string; keyword_id: string; position: number | null }> = [];
  const unmatched = new Set<string>();
  let matched = 0;
  for (const r of siteRows) {
    const kid = kwMap.get(r.keyword);
    const cid = ccMap.get(r.countryCode);
    if (!kid || !cid) { unmatched.add(`${r.keyword || "?"} / ${r.countryCode || "?"}`); continue; }
    matched++;
    if (!hasHistory) payload.push({ week_date: weekPrev, site_id: siteId, country_id: cid, keyword_id: kid, position: r.previous });
    payload.push({ week_date: weekCur, site_id: siteId, country_id: cid, keyword_id: kid, position: r.current });
  }
  if (!payload.length) {
    return { error: "No rows matched this site's keywords/countries — is the export for this project?" };
  }

  const { error } = await supabase.from("rankings").upsert(payload, { onConflict: "week_date,site_id,country_id,keyword_id" });
  if (error) return { error: error.message };

  revalidatePath("/ranking");
  const ranked = payload.filter((p) => p.week_date === weekCur && p.position !== null).length;
  const parts = [`Imported ${matched} keyword×country pairs for week ${weekCur}: ${ranked} ranking, ${matched - ranked} not.`];
  if (created) parts.push(`${created} new keyword${created === 1 ? "" : "s"} added.`);
  if (unmatched.size) parts.push(`${unmatched.size} unmatched skipped.`);
  return { ok: true, message: parts.join(" ") };
}
