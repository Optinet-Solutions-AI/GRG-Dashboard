import { getOverview, getTop10Trend } from "@/lib/data/overview";
import { StatCard } from "@/components/StatCard";
import { TrendChart } from "@/components/charts/TrendChart";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  const siteId = site ?? null;

  const [overview, trend] = await Promise.all([getOverview(siteId), getTop10Trend(siteId)]);

  const supabase = await createServerSupabaseClient();
  let sq = supabase
    .from("seo_scores")
    .select("seo_score, passed_tests, warnings, failed_tests, date, site_id, sites(display_name)")
    .order("date", { ascending: false });
  if (siteId) sq = sq.eq("site_id", siteId);
  const { data: seoRows } = await sq;
  // latest entry per site
  const seen = new Set<string>();
  const latestSeo = ((seoRows ?? []) as Array<Record<string, unknown> & { site_id: string }>).filter((r) => {
    if (seen.has(r.site_id)) return false;
    seen.add(r.site_id);
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Overview</h1>
        <span className="text-sm text-slate-500">
          {overview?.latest_week ? `Latest ranking week: ${overview.latest_week}` : ""}
        </span>
      </div>

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
        <div className="mb-3 font-semibold text-slate-900">SEO score by site (latest)</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Site</th>
              <th className="py-1">SEO Score</th>
              <th className="py-1">Passed</th>
              <th className="py-1">Warnings</th>
              <th className="py-1">Failed</th>
            </tr>
          </thead>
          <tbody>
            {latestSeo.map((r, i) => {
              const s = r.sites as { display_name?: string } | null;
              return (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1.5">{s?.display_name ?? "—"}</td>
                  <td className="py-1.5 font-medium text-slate-800">{String(r.seo_score ?? "—")}</td>
                  <td className="py-1.5 text-green-700">{String(r.passed_tests ?? "—")}</td>
                  <td className="py-1.5 text-amber-700">{String(r.warnings ?? "—")}</td>
                  <td className="py-1.5 text-red-700">{String(r.failed_tests ?? "—")}</td>
                </tr>
              );
            })}
            {latestSeo.length === 0 ? (
              <tr><td colSpan={5} className="py-2 text-slate-500">No SEO data yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
