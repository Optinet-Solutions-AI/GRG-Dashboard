import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBpnClient, type BpnClient } from "./bpn-client";
import { buildWeek, isoWeekMonday, sweepVerdict } from "./bpn-week";

export type IngestResult = {
  site: string;
  week: string;
  written: number;
  checked: number;
  ranked: number;
  coverage: number | null;
  partial: boolean;
  unmatched: number;
  skipped: string | null;
  note: string;
};

function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Ingest one ISO week of rankings from the BPN tracker into `rankings`.
 *
 * Read-only against the tracker: it never triggers a sweep, it only reads what has
 * already been checked. Refuses to store a week the sweep verdict distrusts, and
 * writes nothing at all for pairs the tracker didn't check that week (a missing row
 * renders as a muted "·", which is honest; a carried-forward stale rank is not).
 */
export async function ingestRankingWeek(opts: {
  siteDomain?: string;
  week?: string;
  dryRun?: boolean;
  db?: SupabaseClient;
  api?: BpnClient;
} = {}): Promise<IngestResult[]> {
  const db = opts.db ?? serviceClient();
  const api = opts.api ?? createBpnClient({});
  const week = opts.week ?? isoWeekMonday(new Date());

  let q = db.from("sites").select("id, domain, display_name").eq("active", true).order("sort_order");
  if (opts.siteDomain) q = q.eq("domain", opts.siteDomain);
  const { data: sites, error: sitesErr } = await q;
  if (sitesErr) throw new Error(`sites lookup failed: ${sitesErr.message}`);
  if (!sites?.length) throw new Error(opts.siteDomain ? `no active site ${opts.siteDomain}` : "no active sites");

  const [{ data: kwsRaw }, { data: ctsRaw }] = await Promise.all([
    db.from("keywords").select("id, text"),
    db.from("countries").select("id, code"),
  ]);
  const kwMap = new Map((kwsRaw ?? []).map((k) => [String(k.text).trim(), k.id as string]));
  const ccMap = new Map((ctsRaw ?? []).map((c) => [String(c.code).toUpperCase(), c.id as string]));

  const out: IngestResult[] = [];

  for (const site of sites as Array<{ id: string; domain: string; display_name: string }>) {
    const base = { site: site.domain, week, written: 0, unmatched: 0 };

    // The previous stored week is our yardstick for both coverage and the all-zero check.
    const { data: prevWeeks } = await db
      .from("rankings")
      .select("week_date")
      .eq("site_id", site.id)
      .lt("week_date", week)
      .order("week_date", { ascending: false })
      .limit(1);
    const prevWeek = (prevWeeks ?? [])[0]?.week_date as string | undefined;

    let expectedPairs: number | undefined;
    let prevRanked: number | null = null;
    if (prevWeek) {
      const { data: prevRows } = await db
        .from("rankings")
        .select("position")
        .eq("site_id", site.id)
        .eq("week_date", prevWeek);
      expectedPairs = prevRows?.length;
      prevRanked = (prevRows ?? []).filter((r) => r.position != null).length;
    }

    const rows = await api.history({ domain: site.domain, from: week, to: plusDays(week, 6) });
    const build = buildWeek(rows, week, expectedPairs);
    const verdict = sweepVerdict(build, prevRanked);

    const common = {
      ...base,
      checked: build.checked,
      ranked: build.ranked,
      coverage: build.coverage,
      partial: verdict.partial,
    };

    if (!verdict.write) {
      out.push({ ...common, skipped: verdict.reason, note: `nothing written for ${week}` });
      continue;
    }

    const payload: Array<{
      week_date: string; site_id: string; country_id: string; keyword_id: string; position: number | null;
    }> = [];
    let unmatched = 0;
    for (const p of build.pairs) {
      const kid = kwMap.get(p.keyword.trim());
      const cid = ccMap.get(p.country.toUpperCase());
      if (!kid || !cid) { unmatched++; continue; }
      payload.push({ week_date: week, site_id: site.id, country_id: cid, keyword_id: kid, position: p.position });
    }

    if (opts.dryRun) {
      out.push({ ...common, unmatched, written: payload.length, skipped: null, note: `DRY RUN — would write ${payload.length} pairs. ${verdict.reason}` });
      continue;
    }
    if (!payload.length) {
      out.push({ ...common, unmatched, skipped: "no pairs matched this site's keywords/countries", note: `nothing written for ${week}` });
      continue;
    }

    // Authoritative per week, same contract as the manual upload: this run is the
    // source of truth for the week it writes, so a re-run self-heals a partial week.
    const del = await db.from("rankings").delete().eq("site_id", site.id).eq("week_date", week);
    if (del.error) throw new Error(`delete ${week} failed: ${del.error.message}`);
    const ins = await db.from("rankings").insert(payload);
    if (ins.error) throw new Error(`insert ${week} failed: ${ins.error.message}`);

    out.push({ ...common, unmatched, written: payload.length, skipped: null, note: verdict.reason });
  }

  return out;
}
