import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRankingWeeks, getRankingGrid } from "@/lib/data/ranking";
import { RankingGrid } from "@/components/ranking/RankingGrid";
import { WeekSelector } from "@/components/ranking/WeekSelector";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { addRankingWeek } from "./actions";
import { AddRankingWeek } from "@/components/entry/AddRankingWeek";
import { ImportRankings } from "@/components/ranking/ImportRankings";

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ site?: string; week?: string }> }) {
  const { site, week } = await searchParams;

  const supabase = await createServerSupabaseClient();
  const { data: sites } = await supabase.from("sites").select("id, display_name").order("sort_order");
  const siteList = sites ?? [];
  const selected = siteList.find((s) => s.id === site) ?? siteList[0];

  if (!selected) return <p className="text-sm text-slate-500">No sites configured yet.</p>;

  const weeks = await getRankingWeeks();
  const currentWeek = week && weeks.includes(week) ? week : weeks[0];
  const rows = currentWeek ? await getRankingGrid(selected.id, currentWeek) : [];

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
        {weeks.length ? <WeekSelector weeks={weeks} current={currentWeek} /> : null}
      </div>
      <p className="text-xs text-slate-500">
        <span className="font-semibold text-green-600">↑</span> improved · <span className="font-semibold text-red-600">↓</span> dropped vs previous week · (n) = previous position · grey = not in top 100.
        {!site ? " Showing the first site — use the selector in the top bar to change site." : ""}
      </p>
      {isAdmin ? <ImportRankings siteId={selected.id} /> : null}
      {entry}
      <RankingGrid rows={rows} />
    </div>
  );
}
