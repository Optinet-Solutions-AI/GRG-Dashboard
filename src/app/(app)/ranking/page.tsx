import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRankingGridByWeek, getKeywordVolumes } from "@/lib/data/ranking";
import { RankingGrid } from "@/components/ranking/RankingGrid";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { addRankingWeek } from "./actions";
import { AddRankingWeek } from "@/components/entry/AddRankingWeek";
import { ImportRankings } from "@/components/ranking/ImportRankings";

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;

  const supabase = await createServerSupabaseClient();
  const { data: sites } = await supabase.from("sites").select("id, display_name").order("sort_order");
  const siteList = sites ?? [];
  const selected = siteList.find((s) => s.id === site) ?? siteList[0];
  if (!selected) return <p className="text-sm text-slate-500">No sites configured yet.</p>;

  // Single round-trip for the most recent ~6 months of weeks (was one RPC per week).
  const weekly = await getRankingGridByWeek(selected.id, 26); // newest first
  const weeks = weekly.map((w) => w.week);
  const volumes = await getKeywordVolumes();

  const isAdmin = isAdminRole(await getCurrentRole());
  let entry = null;
  if (isAdmin && weeks.length) {
    const [{ data: kws }, { data: ctys }, { data: latest }] = await Promise.all([
      supabase.from("keywords").select("id, text").order("sort_order"),
      supabase.from("countries").select("id, code").order("sort_order"),
      supabase.from("rankings").select("keyword_id, country_id, position").eq("site_id", selected.id).eq("week_date", weeks[0]),
    ]);
    const prefill: Record<string, number | null> = {};
    for (const r of (latest ?? []) as Array<{ keyword_id: string; country_id: string; position: number | null }>) {
      prefill[`${r.keyword_id}|${r.country_id}`] = r.position;
    }
    entry = (
      <AddRankingWeek
        keywords={(kws ?? []) as { id: string; text: string }[]}
        countries={(ctys ?? []) as { id: string; code: string }[]}
        prefill={prefill}
        defaultDate={weeks[0]}
        action={addRankingWeek.bind(null, selected.id)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Ranking — {selected.display_name}</h1>
        <span className="text-xs text-slate-500">{weeks.length} week{weeks.length === 1 ? "" : "s"} tracked · newest on top</span>
      </div>
      <p className="text-xs text-slate-500">
        <span className="font-semibold text-emerald-600">↑</span> improved · <span className="font-semibold text-rose-500">↓</span> dropped vs previous week · (n) = previous position · <span className="text-slate-400">Not in top 100</span> = tracked but unranked · muted <span className="text-slate-300">·</span> = not tracked in that market. Keywords are grouped by target market.
        {!site ? " Showing the first site — use the selector in the top bar to change site." : ""}
      </p>

      {isAdmin ? (
        <details className="rounded-xl border border-slate-200 bg-white p-4" open={weeks.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">Update rankings (admin)</summary>
          <p className="mt-2 text-xs text-slate-500">
            Import detects the week automatically from the Ahrefs export&apos;s date and adds it as a new snapshot.
          </p>
          <div className="mt-3 space-y-3">
            <ImportRankings siteId={selected.id} />
            <a href="/manage/volumes" className="inline-block text-sm font-medium text-slate-700 underline hover:text-slate-900">
              Edit search volumes (GSV + per-market) →
            </a>
            {entry}
          </div>
        </details>
      ) : null}

      {weeks.length === 0 ? (
        <p className="text-sm text-slate-500">No ranking data yet{isAdmin ? " — import an Ahrefs export above." : "."}</p>
      ) : (
        <div className="space-y-6 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
          {weekly.map(({ week, rows }, i) => (
            <section key={week}>
              <div className="sticky top-0 -mx-3 mb-2 flex items-center gap-2 bg-slate-50/95 px-3 py-1 backdrop-blur">
                <h2 className="text-sm font-semibold text-slate-800">Week of {week}</h2>
                {i === 0 ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Latest</span> : null}
              </div>
              <RankingGrid rows={rows} globalVolume={volumes.global} marketVolume={volumes.perMarket} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
