import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRankingGridByWeek, getKeywordVolumes } from "@/lib/data/ranking";
import { RankingGrid } from "@/components/ranking/RankingGrid";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { ImportRankings } from "@/components/ranking/ImportRankings";
import { SyncRankings } from "@/components/ranking/SyncRankings";
import { createBpnClient } from "@/lib/rankings/bpn-client";
import { LanguageToggle, parseGridLanguage } from "@/components/ranking/LanguageToggle";
import { CheckSummary, type RankingCheck } from "@/components/ranking/CheckSummary";

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ site?: string; lang?: string }> }) {
  const { site, lang } = await searchParams;
  const requested = parseGridLanguage(lang);

  const supabase = await createServerSupabaseClient();
  const { data: sites } = await supabase.from("sites").select("id, display_name, domain, tracked_languages").order("sort_order");
  const siteList = sites ?? [];
  const selected = siteList.find((s) => s.id === site) ?? siteList[0];
  if (!selected) return <p className="text-sm text-slate-500">No sites configured yet.</p>;

  // A site only shows the languages it tracks. .org and .net are Arabic-only, so their English
  // tab would promise a grid that is never meant to exist — ?lang=en there falls back to Arabic
  // and the toggle is hidden entirely rather than offered as a dead end.
  const trackedLanguages = ((selected as { tracked_languages?: string[] }).tracked_languages ?? ["ar", "en"])
    .filter((l): l is "ar" | "en" => l === "ar" || l === "en");
  const language = trackedLanguages.includes(requested) ? requested : "ar";

  // Single round-trip for the most recent ~6 months of weeks (was one RPC per week).
  const weeklyAll = await getRankingGridByWeek(selected.id, 26); // newest first
  const volumes = await getKeywordVolumes();

  // Split the grid by keyword language. Filtering here rather than inside ranking_grid_multi
  // keeps that function untouched — recreating it is what once broke the entire grid, since
  // a set-returning function's row type is checked at call time.
  const { data: kwRows } = await supabase.from("keywords").select("text, language");
  const languageOf = new Map((kwRows ?? []).map((k) => [String(k.text).trim(), String(k.language)]));
  const inLanguage = (keyword: string) => (languageOf.get(keyword.trim()) ?? "ar") === language;
  // Counted from THIS site's rows, not the whole keywords table: the table is shared across
  // the three sites, so a global count told the .org page it had 95 Arabic keywords when the
  // number belonged almost entirely to .com.
  const counts = { ar: 0, en: 0 } as Record<"ar" | "en", number>;
  const seenHere = new Set<string>();
  for (const { rows } of weeklyAll) {
    for (const r of rows) {
      if (seenHere.has(r.keyword)) continue;
      seenHere.add(r.keyword);
      counts[(languageOf.get(r.keyword.trim()) ?? "ar") === "en" ? "en" : "ar"]++;
    }
  }

  const weekly = weeklyAll
    .map(({ week, rows }) => ({ week, rows: rows.filter((r) => inLanguage(r.keyword)) }))
    .filter(({ rows }) => rows.length > 0);
  const weeks = weekly.map((w) => w.week);

  // The roster each week should display: every keyword tracked AS OF that week, and every
  // market, whether or not the checker returned a result. Without it a skipped keyword
  // simply vanished from the week, so blocks showed 7 or 9 of the 12 that are tracked.
  // Anchored on the week a keyword first appeared, so one added later is not back-dated
  // into weeks it never belonged to.
  const keywordSort = new Map<string, number>();
  const countrySort = new Map<string, number>();
  const countrySortFromTargets = new Map<string, number>();
  const firstWeek = new Map<string, string>();
  for (const { week, rows } of weekly) {
    for (const r of rows) {
      keywordSort.set(r.keyword, r.keyword_sort);
      countrySort.set(r.country, r.country_sort);
      const seen = firstWeek.get(r.keyword);
      if (!seen || week < seen) firstWeek.set(r.keyword, week);
    }
  }
  const allCountries = [...countrySort.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c);
  const rosterFor = (week: string) => ({
    keywords: [...keywordSort.entries()]
      .filter(([kw]) => (firstWeek.get(kw) ?? week) <= week)
      .sort((a, b) => a[1] - b[1])
      .map(([kw]) => kw),
    countries: allCountries,
  });

  // The intended shape of the table, from the keyword sheet (keyword_targets). A site with no
  // targets keeps the old inferred behaviour, so .com — whose layout is already right — is
  // untouched. Markets a sweep skipped then show as gaps in the right place instead of
  // reshaping the whole table.
  const { data: targetRows } = await supabase
    .from("keyword_targets")
    .select("group_code, keywords(text), countries(code, sort_order)")
    .eq("site_id", selected.id);
  type TargetRow = { group_code: string; keywords: { text: string } | null; countries: { code: string; sort_order: number | null } | null };
  const targets = (targetRows ?? []) as unknown as TargetRow[];

  const groupOrder = new Map<string, number>();
  const groupKeywords = new Map<string, string[]>();
  const targetMarkets = new Map<string, string[]>();
  for (const t of targets) {
    const kw = t.keywords?.text?.trim();
    const cc = t.countries?.code;
    if (!kw || !cc || !inLanguage(kw)) continue;
    countrySortFromTargets.set(cc, t.countries?.sort_order ?? 0);
    const list = groupKeywords.get(t.group_code) ?? [];
    if (!list.includes(kw)) list.push(kw);
    groupKeywords.set(t.group_code, list);
    // ALL sorts first, then each market in column order.
    groupOrder.set(t.group_code, t.group_code === "ALL" ? -1 : (t.countries?.sort_order ?? 0));
    const mk = targetMarkets.get(kw) ?? [];
    if (!mk.includes(cc)) mk.push(cc);
    targetMarkets.set(kw, mk);
  }
  const targetCountries = [...countrySortFromTargets.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c);
  const groups = [...groupKeywords.entries()]
    .sort((a, b) => (groupOrder.get(a[0]) ?? 0) - (groupOrder.get(b[0]) ?? 0))
    .map(([code, kws]) => ({ code, keywords: kws }));

  // Which markets each keyword targets, gathered across every week on the page. A single
  // week can't answer this: a pair the sweep failed to check is simply absent, which
  // would read as "not tracked here" and reshuffle the market groups.
  const trackedMarkets = new Map<string, string[]>();
  for (const { rows } of weekly) {
    for (const r of rows) {
      const list = trackedMarkets.get(r.keyword) ?? [];
      if (!list.includes(r.country)) list.push(r.country);
      trackedMarkets.set(r.keyword, list);
    }
  }

  // What the checker last looked at for this site. Only keywords that earn a place get a
  // ranking row, so a site checked with nothing in the top 100 stores zero rows — this is how
  // the empty state tells that apart from "never checked".
  const { data: checkRows } = await supabase
    .from("ranking_checks")
    .select("week_date, keywords_checked, pairs_checked, pairs_ranked, markets")
    .eq("site_id", selected.id)
    .order("week_date", { ascending: false })
    .limit(1);
  const lastCheck = (checkRows?.[0] ?? null) as RankingCheck | null;

  const isAdmin = isAdminRole(await getCurrentRole());

  // Freshness hint for the sync panel. Admin-only and best-effort: if the tracker is
  // unreachable the page still renders, just without the hint.
  let lastChecked: string | null = null;
  if (isAdmin) {
    try {
      const registry = await createBpnClient({}).domains();
      const domain = String(selected.domain ?? "").toLowerCase();
      lastChecked = registry.find((d) => d.domain.toLowerCase() === domain)?.last_checked ?? null;
    } catch {
      lastChecked = null;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Ranking — {selected.display_name}</h1>
        <span className="text-xs text-slate-500">{weeks.length} week{weeks.length === 1 ? "" : "s"} tracked · newest on top</span>
      </div>
      <p className="text-xs text-slate-500">
        <span className="font-semibold text-emerald-600">↑</span> improved · <span className="font-semibold text-rose-500">↓</span> dropped vs previous week · (n) = previous position · <span className="rounded bg-rose-50 px-1 font-semibold text-rose-700 ring-1 ring-rose-200">↓ Lost</span> = was ranked last week, now out of the top 100 · <span className="text-slate-400">Not in top 100</span> = tracked, never ranked · <span className="rounded bg-amber-50 px-1 font-medium text-amber-700 ring-1 ring-amber-200">Not checked</span> = the rank checker never ran this keyword in that market that week — not a ranking result · muted <span className="text-slate-300">·</span> = not tracked in that market. Keywords are grouped by target market.
        {!site ? " Showing the first site — use the selector in the top bar to change site." : ""}
      </p>

      {trackedLanguages.length > 1 ? (
        <LanguageToggle site={site} current={language} counts={counts} />
      ) : null}

      {isAdmin ? (
        <details className="rounded-xl border border-slate-200 bg-white p-4" open={weeks.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">Update rankings (admin)</summary>
          <p className="mt-2 text-xs text-slate-500">
            Rankings sync from the rank tracker automatically. Use the buttons below to pull them in now, or upload an export by hand — it accepts an Ahrefs CSV or a multi-domain rank-tracker XLSX, and the week is detected from the export&apos;s date.
          </p>
          <div className="mt-3 space-y-3">
            <SyncRankings lastChecked={lastChecked} />
            <ImportRankings siteId={selected.id} />
            <a href="/manage/volumes" className="inline-block text-sm font-medium text-slate-700 underline hover:text-slate-900">
              Edit search volumes (GSV + per-market) →
            </a>
          </div>
        </details>
      ) : null}

      {weeks.length === 0 ? (
        language === "en" ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-700">No English keywords are being tracked yet.</p>
            <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">
              The English set is still being prepared in the rank tracker. As soon as it returns positions they appear
              here, in their own grid — the Arabic table above is unaffected either way.
            </p>
          </div>
        ) : lastCheck ? (
          <CheckSummary check={lastCheck} />
        ) : (
          <p className="text-sm text-slate-500">No ranking data yet{isAdmin ? " — import an Ahrefs export above." : "."}</p>
        )
      ) : (
        <div className="space-y-6 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
          {weekly.map(({ week, rows }, i) => (
            <section key={week}>
              <div className="sticky top-0 -mx-3 mb-2 flex items-center gap-2 bg-slate-50/95 px-3 py-1 backdrop-blur">
                <h2 className="text-sm font-semibold text-slate-800">Week of {week}</h2>
                {i === 0 ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Latest</span> : null}
              </div>
              <RankingGrid
                rows={rows}
                globalVolume={volumes.global}
                trackedMarkets={groups.length ? targetMarkets : trackedMarkets}
                roster={groups.length ? { keywords: [], countries: targetCountries } : rosterFor(week)}
                groups={groups.length ? groups : undefined}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
