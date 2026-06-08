import { getOverview, getTop10Trend } from "@/lib/data/overview";
import { StatCard } from "@/components/StatCard";
import { TrendChart } from "@/components/charts/TrendChart";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  const siteId = site ?? null;

  const [overview, trend] = await Promise.all([getOverview(siteId), getTop10Trend(siteId)]);

  const supabase = await createServerSupabaseClient();
  const { data: siteRows } = await supabase
    .from("seo_scores")
    .select("rankmath_analyzer, seo_homepage, health_score, sites(display_name)")
    .order("date", { ascending: false });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Overview</h1>
        <span className="text-sm text-slate-500">
          {overview?.latest_week ? `Latest ranking week: ${overview.latest_week}` : ""}
        </span>
      </div>

      <AssistantPanel siteId={siteId} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Avg SEO Score" value={overview?.avg_seo != null ? String(overview.avg_seo) : "—"} />
        <StatCard label="Avg PageSpeed" value={overview?.avg_pagespeed != null ? String(overview.avg_pagespeed) : "—"} />
        <StatCard label="Keywords in Top 10" value={String(overview?.keywords_top10 ?? 0)} sub="latest week" />
        <StatCard label="QA Passing" value={overview ? `${overview.qa_passing}/${overview.qa_total}` : "—"} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 font-semibold text-slate-900">Keywords in Top 10 over time</div>
        {trend.length ? <TrendChart data={trend} xKey="week_date" yKey="count" /> : <p className="text-sm text-slate-500">No ranking history.</p>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 font-semibold text-slate-900">SEO scores by site (latest)</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Site</th><th className="py-1">Rankmath</th><th className="py-1">Homepage</th><th className="py-1">Health</th>
            </tr>
          </thead>
          <tbody>
            {(siteRows ?? []).map((r: Record<string, unknown>, i: number) => {
              const site = r.sites as { display_name?: string } | null;
              return (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1.5">{site?.display_name ?? "—"}</td>
                  <td className="py-1.5">{String(r.rankmath_analyzer ?? "—")}</td>
                  <td className="py-1.5">{String(r.seo_homepage ?? "—")}</td>
                  <td className="py-1.5">{String(r.health_score ?? "—")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
