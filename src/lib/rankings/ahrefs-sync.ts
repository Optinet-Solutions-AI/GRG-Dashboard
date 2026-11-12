import "server-only";
import { createClient } from "@supabase/supabase-js";
import { keywordLanguage } from "./openseo.mjs";
import {
  AhrefsError, compareDate, fetchProjectRankings, listProjects, projectForDomain, toRankingRows, weekOf,
  type RankingRow,
} from "./ahrefs-api";

/**
 * Pull every tracked site's rankings straight from Ahrefs and store them.
 *
 * This replaces a chain that only worked while a particular machine was switched on: a
 * person exported a CSV, dropped it in a folder, and a watcher imported it. That chain lost
 * keywords (17 of 30 reached the dashboard on 2026-11-11) and split one sweep across two
 * weeks, because each export stamped its own date.
 *
 * Rows written here are stamped `ahrefs-api` so a re-run replaces exactly its own work and
 * leaves anything a CSV import still owns alone.
 */
export const AHREFS_SOURCE = "ahrefs-api";

export type SiteSyncResult = {
  site: string;
  week: string | null;
  slots: number;
  ranked: number;
  written: number;
  keywordsCreated: number;
  marketsOpened: number;
  skipped?: string;
  error?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = ReturnType<typeof createClient<any, any, any>>;

function serviceClient(): DB {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** Today in UTC — the date Ahrefs is asked about; the week comes from its own answer. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function syncSite(
  db: DB,
  key: string,
  site: { id: string; domain: string },
  projects: Awaited<ReturnType<typeof listProjects>>,
  opts: { dryRun?: boolean; fetchImpl?: typeof fetch },
): Promise<SiteSyncResult> {
  const base: SiteSyncResult = { site: site.domain, week: null, slots: 0, ranked: 0, written: 0, keywordsCreated: 0, marketsOpened: 0 };

  const project = projectForDomain(projects, site.domain);
  if (!project) return { ...base, skipped: "no Ahrefs project targets this domain" };

  const asOf = todayUtc();
  const apiRows = await fetchProjectRankings(key, project.project_id, asOf, compareDate(asOf), { fetchImpl: opts.fetchImpl });
  const rows = toRankingRows(apiRows, site.domain);
  const week = weekOf(apiRows);
  if (!week || !rows.length) return { ...base, week, skipped: "Ahrefs returned no slots for this project" };

  const ranked = rows.filter((r) => r.position != null).length;
  if (opts.dryRun) return { ...base, week, slots: rows.length, ranked, skipped: "dry run — nothing written" };

  // ---- keywords: the project IS the tracked set, so anything new to us is created ----
  const { data: kwRows } = await db.from("keywords").select("id, text, sort_order");
  const byText = new Map((kwRows ?? []).map((k: { id: string; text: string }) => [String(k.text).trim(), k.id as string]));
  const missing = [...new Set(rows.map((r) => r.keyword))].filter((k) => !byText.has(k));
  let keywordsCreated = 0;
  if (missing.length) {
    let nextSort = (kwRows ?? []).reduce((m: number, k: { sort_order: number | null }) => Math.max(m, k.sort_order ?? 0), 0);
    const { data: made, error } = await db
      .from("keywords")
      .insert(missing.map((text) => ({ text, sort_order: ++nextSort, active: true, language: keywordLanguage(text) })))
      .select("id, text");
    if (error) return { ...base, week, error: `keyword insert failed: ${error.message}` };
    for (const k of (made ?? []) as Array<{ id: string; text: string }>) byText.set(String(k.text).trim(), k.id);
    keywordsCreated = made?.length ?? 0;
  }

  const { data: ctRows } = await db.from("countries").select("id, code");
  const byCode = new Map((ctRows ?? []).map((c: { id: string; code: string }) => [String(c.code).toUpperCase(), c.id as string]));

  const payload = rows
    .filter((r) => byText.has(r.keyword) && byCode.has(r.countryCode))
    .map((r) => ({
      week_date: week,
      site_id: site.id,
      keyword_id: byText.get(r.keyword)!,
      country_id: byCode.get(r.countryCode)!,
      position: r.position,
      source_file: AHREFS_SOURCE,
    }));

  // Replace what this source wrote for the week, then the exact pairs it is about to write
  // in case a CSV import still owns them. Never the whole week: another file may share it.
  await db.from("rankings").delete().eq("site_id", site.id).eq("week_date", week).eq("source_file", AHREFS_SOURCE);
  for (const p of payload) {
    await db.from("rankings").delete()
      .eq("site_id", site.id).eq("week_date", week).eq("keyword_id", p.keyword_id).eq("country_id", p.country_id);
  }
  const { error: insErr } = await db.from("rankings").insert(payload);
  if (insErr) return { ...base, week, error: `ranking insert failed: ${insErr.message}` };

  // ---- make new keywords visible: the grid draws its shape from keyword_targets ----
  const { data: existingTargets } = await db.from("keyword_targets").select("keyword_id, country_id").eq("site_id", site.id);
  const haveTarget = new Set((existingTargets ?? []).map((t: { keyword_id: string; country_id: string }) => `${t.keyword_id}|${t.country_id}`));
  const keywordHasAnyTarget = new Set((existingTargets ?? []).map((t: { keyword_id: string }) => t.keyword_id));
  const newTargets = payload
    .filter((p) => !haveTarget.has(`${p.keyword_id}|${p.country_id}`) && !keywordHasAnyTarget.has(p.keyword_id))
    .map((p) => ({ site_id: site.id, keyword_id: p.keyword_id, country_id: p.country_id, group_code: "AHREFS" }));
  let marketsOpened = 0;
  if (newTargets.length) {
    const { error } = await db.from("keyword_targets").insert(newTargets);
    if (!error) marketsOpened = newTargets.length;
  }

  // Record that the check happened, separately from what it found, so a week where nothing
  // ranked is distinguishable from a week nobody checked.
  await db.from("ranking_checks").upsert(
    {
      site_id: site.id,
      week_date: week,
      keywords_checked: new Set(rows.map((r) => r.keyword)).size,
      pairs_checked: payload.length,
      pairs_ranked: ranked,
      markets: [...new Set(rows.map((r) => r.countryCode))].sort(),
    },
    { onConflict: "site_id,week_date" },
  );

  return { site: site.domain, week, slots: rows.length, ranked, written: payload.length, keywordsCreated, marketsOpened };
}

export async function syncRankingsFromAhrefs(
  opts: { dryRun?: boolean; fetchImpl?: typeof fetch; db?: DB } = {},
): Promise<{ ok: boolean; results: SiteSyncResult[]; error?: string }> {
  const key = process.env.AHREFS_API_KEY?.trim();
  if (!key) return { ok: false, results: [], error: "AHREFS_API_KEY is not set." };

  const db = opts.db ?? serviceClient();
  const { data: sites, error } = await db.from("sites").select("id, domain").order("sort_order");
  if (error) return { ok: false, results: [], error: `could not read the sites list: ${error.message}` };

  let projects;
  try {
    projects = await listProjects(key, { fetchImpl: opts.fetchImpl });
  } catch (e) {
    return { ok: false, results: [], error: e instanceof AhrefsError ? e.message : String(e) };
  }

  const results: SiteSyncResult[] = [];
  for (const site of (sites ?? []) as Array<{ id: string; domain: string }>) {
    try {
      results.push(await syncSite(db, key, site, projects, opts));
    } catch (e) {
      // One project failing must not cost the other two their week.
      results.push({ site: site.domain, week: null, slots: 0, ranked: 0, written: 0, keywordsCreated: 0, marketsOpened: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ok: results.some((r) => r.written > 0) || opts.dryRun === true, results };
}
