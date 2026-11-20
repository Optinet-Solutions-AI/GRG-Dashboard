import "server-only";
import { createClient } from "@supabase/supabase-js";
import { keywordKey } from "@/lib/backlinks/keyword-tally";
import { affordable, callCost, cycleCost, ROWS_PER_CALL } from "./cost";
import { keyAllowance, organicKeywords, DiscoveryError } from "./ahrefs-organic";
import { cycleOf, markNew, toDiscoveryRows, withoutTracked } from "./select";

/**
 * One monthly pull of "keywords we rank for but do not track".
 *
 * Three rules shape it, all of them about not doing harm:
 *
 *  1. Price the whole cycle and check the key can pay BEFORE the first call. The key is the
 *     one the Wednesday rankings sync uses; exhausting it is the only way this feature could
 *     break something that already works.
 *  2. Never buy the same pair twice in a cycle. A pair already in keyword_discovery_fetches is
 *     skipped, so a re-run after a failure resumes instead of spending again.
 *  3. Stop the whole run on a halt — a charge Ahrefs' own pricing cannot explain — rather than
 *     continue and find out how much it costs.
 */
export type PairResult = {
  site: string;
  country: string;
  rows: number;
  units: number;
  skipped?: string;
  error?: string;
};

export type DiscoveryRun = {
  ok: boolean;
  cycle: string;
  dryRun: boolean;
  estimatedUnits: number;
  spentUnits: number;
  pairs: PairResult[];
  error?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = ReturnType<typeof createClient<any, any, any>>;

function serviceClient(): DB {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export async function runDiscovery(opts: { dryRun?: boolean; fetchImpl?: typeof fetch; db?: DB } = {}): Promise<DiscoveryRun> {
  const cycle = cycleOf();
  const base: DiscoveryRun = { ok: false, cycle, dryRun: !!opts.dryRun, estimatedUnits: 0, spentUnits: 0, pairs: [] };

  const key = process.env.AHREFS_API_KEY?.trim();
  if (!key) return { ...base, error: "AHREFS_API_KEY is not set." };

  const db = opts.db ?? serviceClient();
  const [{ data: sites }, { data: countries }] = await Promise.all([
    db.from("sites").select("id, domain").order("sort_order"),
    db.from("countries").select("id, code").order("sort_order"),
  ]);
  const siteList = (sites ?? []) as Array<{ id: string; domain: string }>;
  const countryList = (countries ?? []) as Array<{ id: string; code: string }>;
  if (!siteList.length || !countryList.length) return { ...base, error: "No sites or countries configured." };

  // Pairs already bought this cycle are free to skip, so only the rest need paying for.
  const { data: fetched } = await db
    .from("keyword_discovery_fetches")
    .select("site_id, country_id, units")
    .eq("cycle", cycle);
  const done = new Set((fetched ?? []).map((f: { site_id: string; country_id: string }) => `${f.site_id}|${f.country_id}`));
  const alreadySpent = (fetched ?? []).reduce((s: number, f: { units: number }) => s + (f.units ?? 0), 0);

  const todo: Array<{ site: { id: string; domain: string }; country: { id: string; code: string } }> = [];
  for (const site of siteList) for (const country of countryList) {
    if (!done.has(`${site.id}|${country.id}`)) todo.push({ site, country });
  }
  const estimatedUnits = todo.length * callCost(ROWS_PER_CALL);

  if (!todo.length) {
    return { ...base, ok: true, estimatedUnits: 0, spentUnits: alreadySpent, error: undefined, pairs: [{ site: "all", country: "all", rows: 0, units: 0, skipped: "this cycle is already complete" }] };
  }

  const allowance = await keyAllowance(key, { fetchImpl: opts.fetchImpl });
  const can = affordable(allowance, estimatedUnits);
  if (!can.ok) return { ...base, estimatedUnits, error: can.reason };

  if (opts.dryRun) {
    return {
      ...base, ok: true, estimatedUnits,
      pairs: todo.map((t) => ({ site: t.site.domain, country: t.country.code, rows: 0, units: 0, skipped: "dry run — nothing bought" })),
    };
  }

  // What the sites already track, so the list is only what we are NOT watching.
  const { data: targetRows } = await db.from("keyword_targets").select("site_id, keywords(text)");
  const trackedBySite = new Map<string, Set<string>>();
  // PostgREST types an embedded relation as an array here even though it is one row, so the
  // text is read defensively rather than cast into a shape the client does not promise.
  for (const t of (targetRows ?? []) as unknown as Array<{ site_id: string; keywords: { text?: string } | { text?: string }[] | null }>) {
    const set = trackedBySite.get(t.site_id) ?? new Set<string>();
    const kw = Array.isArray(t.keywords) ? t.keywords[0] : t.keywords;
    if (kw?.text) set.add(keywordKey(kw.text));
    trackedBySite.set(t.site_id, set);
  }

  const today = new Date().toISOString().slice(0, 10);
  const pairs: PairResult[] = [];
  let spentUnits = alreadySpent;
  let halted = false;

  for (const { site, country } of todo) {
    if (halted) { pairs.push({ site: site.domain, country: country.code, rows: 0, units: 0, skipped: "run halted" }); continue; }
    try {
      const { rows, unitsCharged } = await organicKeywords(
        key, { target: site.domain, country: country.code, date: today }, { fetchImpl: opts.fetchImpl },
      );
      spentUnits += unitsCharged;

      const kept = withoutTracked(toDiscoveryRows(rows), trackedBySite.get(site.id) ?? new Set());
      if (kept.length) {
        await db.from("keyword_discovery").upsert(
          kept.map((r) => ({
            cycle, site_id: site.id, country_id: country.id,
            keyword: r.keyword, position: r.position, url: r.url, volume: r.volume,
          })),
          { onConflict: "cycle,site_id,country_id,keyword" },
        );
      }
      // Recorded even when nothing was kept: the pair WAS bought, and must not be bought again.
      await db.from("keyword_discovery_fetches").upsert(
        { cycle, site_id: site.id, country_id: country.id, row_count: kept.length, units: unitsCharged },
        { onConflict: "cycle,site_id,country_id" },
      );
      pairs.push({ site: site.domain, country: country.code, rows: kept.length, units: unitsCharged });
    } catch (e) {
      const halt = e instanceof DiscoveryError && e.halt;
      if (halt) halted = true;
      pairs.push({ site: site.domain, country: country.code, rows: 0, units: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { ok: pairs.some((p) => p.rows > 0) && !halted, cycle, dryRun: false, estimatedUnits, spentUnits, pairs };
}

/** The list for one site's latest complete cycle, with NEW against the month before. */
export async function discoveryForSite(db: DB, siteId: string) {
  const { data: cycles } = await db
    .from("keyword_discovery").select("cycle").eq("site_id", siteId).order("cycle", { ascending: false }).limit(200);
  const seen = [...new Set((cycles ?? []).map((c: { cycle: string }) => c.cycle))];
  const current = seen[0];
  if (!current) return { cycle: null, rows: [] as ReturnType<typeof markNew> };

  const previous = seen[1] ?? null;
  const [{ data: now }, { data: before }, { data: prevFetches }, { data: countries }] = await Promise.all([
    db.from("keyword_discovery").select("keyword, position, url, volume, country_id").eq("site_id", siteId).eq("cycle", current),
    previous
      ? db.from("keyword_discovery").select("keyword, country_id").eq("site_id", siteId).eq("cycle", previous)
      : Promise.resolve({ data: [] }),
    previous
      ? db.from("keyword_discovery_fetches").select("site_id").eq("site_id", siteId).eq("cycle", previous)
      : Promise.resolve({ data: [] }),
    db.from("countries").select("id, code"),
  ]);
  const codeOf = new Map((countries ?? []).map((c: { id: string; code: string }) => [c.id as string, String(c.code).toUpperCase()]));

  const rows = ((now ?? []) as Array<{ keyword: string; position: number; url: string; volume: number | null; country_id: string }>)
    .map((r) => ({ keyword: r.keyword, countryCode: codeOf.get(r.country_id) ?? "", position: r.position, url: r.url, volume: r.volume }))
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0) || a.position - b.position);

  const previousKeys = new Set(
    ((before ?? []) as Array<{ keyword: string; country_id: string }>).map((r) => `${r.keyword}|${codeOf.get(r.country_id) ?? ""}`),
  );
  // Last month only counts as evidence of absence if it actually finished every market.
  const expectedPairs = codeOf.size;
  const previousCycleComplete = (prevFetches ?? []).length >= expectedPairs;

  return { cycle: current, rows: markNew(rows, previousKeys, { previousCycleComplete }) };
}
