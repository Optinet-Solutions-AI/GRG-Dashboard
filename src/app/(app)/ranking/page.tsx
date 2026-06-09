import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRankingWeeks, getRankingGrid } from "@/lib/data/ranking";
import { RankingGrid } from "@/components/ranking/RankingGrid";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { addRankingWeek } from "./actions";
import { AddRankingWeek } from "@/components/entry/AddRankingWeek";
import { ImportRankings } from "@/components/ranking/ImportRankings";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;

  const supabase = await createServerSupabaseClient();
  const { data: sites } = await supabase.from("sites").select("id, display_name").order("sort_order");
  const siteList = sites ?? [];
  const selected = siteList.find((s) => s.id === site) ?? siteList[0];
  if (!selected) return <p className="text-sm text-slate-500">No sites configured yet.</p>;

  const weeks = (await getRankingWeeks()).slice(0, 26); // newest first, capped to ~6 months
  const grids = await Promise.all(weeks.map((w) => getRankingGrid(selected.id, w)));

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
        <span className="font-semibold text-green-600">↑</span> improved · <span className="font-semibold text-red-600">↓</span> dropped vs previous week · (n) = previous position · grey = not in top 100.
        {!site ? " Showing the first site — use the selector in the top bar to change site." : ""}
      </p>

      <AssistantPanel siteId={selected.id} />

      {isAdmin ? (
        <details className="rounded-xl border border-slate-200 bg-white p-4" open={weeks.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">Update rankings (admin)</summary>
          <p className="mt-2 text-xs text-slate-500">
            Import detects the week automatically from the Ahrefs export&apos;s date and adds it as a new snapshot.
          </p>
          <div className="mt-3 space-y-3">
            <ImportRankings siteId={selected.id} />
            {entry}
          </div>
        </details>
      ) : null}

      {weeks.length === 0 ? (
        <p className="text-sm text-slate-500">No ranking data yet{isAdmin ? " — import an Ahrefs export above." : "."}</p>
      ) : (
        <div className="max-h-[72vh] space-y-6 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/40 p-3">
          {weeks.map((w, i) => (
            <section key={w}>
              <div className="sticky top-0 -mx-3 mb-2 flex items-center gap-2 bg-slate-50/95 px-3 py-1 backdrop-blur">
                <h2 className="text-sm font-semibold text-slate-800">Week of {w}</h2>
                {i === 0 ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Latest</span> : null}
              </div>
              <RankingGrid rows={grids[i]} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
