import { createServerSupabaseClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/StatCard";
import { TrendChart } from "@/components/charts/TrendChart";

const monthKey = (d: string) => d.slice(0, 7);

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: sites } = await supabase.from("sites").select("id, display_name").order("sort_order");
  const selected = (sites ?? []).find((s) => s.id === site) ?? (sites ?? [])[0];
  if (!selected) return <p className="text-sm text-slate-500">No sites configured yet.</p>;
  const siteId = selected.id;

  // ---- Backlinks KPIs ----
  const { data: bl } = await supabase.from("backlinks").select("date, indexed").eq("site_id", siteId).limit(5000);
  const blRows = (bl ?? []) as { date: string; indexed: string | null }[];
  const blTotal = blRows.length;
  const blIndexed = blRows.filter((r) => r.indexed && !/^(no|not)/i.test(r.indexed.trim())).length;
  const blByMonth = new Map<string, number>();
  for (const r of blRows) blByMonth.set(monthKey(r.date), (blByMonth.get(monthKey(r.date)) ?? 0) + 1);
  const blMonthData = [...blByMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count }));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const blThisMonth = blByMonth.get(thisMonth) ?? 0;

  // ---- Ranking KPIs (latest week) ----
  const { data: weeks } = await supabase.rpc("ranking_weeks");
  const latestWeek = ((weeks ?? []) as { week_date: string }[])[0]?.week_date ?? null;
  let top10 = 0, top3 = 0, ranked = 0, sumPos = 0, totalCells = 0;
  if (latestWeek) {
    const { data: grid } = await supabase.rpc("ranking_grid", { p_site_id: siteId, p_week: latestWeek });
    for (const r of (grid ?? []) as { position: number | null }[]) {
      totalCells++;
      if (r.position != null) { ranked++; sumPos += r.position; if (r.position <= 10) top10++; if (r.position <= 3) top3++; }
    }
  }
  const avgPos = ranked ? Math.round(sumPos / ranked) : null;
  const { data: trend } = await supabase.rpc("rankings_top10_trend", { p_site_id: siteId });
  const trendData = (trend ?? []) as { week_date: string; count: number }[];

  // ---- Overall (latest snapshots) ----
  const [{ data: seo }, { data: ps }, { data: health }] = await Promise.all([
    supabase.from("seo_scores").select("seo_score").eq("site_id", siteId).order("date", { ascending: false }).limit(1),
    supabase.from("pagespeed_entries").select("mobile_score, desktop_score, pagespeed_urls!inner(site_id)").eq("pagespeed_urls.site_id", siteId).order("date", { ascending: false }).limit(1),
    supabase.from("health_snapshots").select("domain_rating, organic_traffic, organic_keywords").eq("site_id", siteId).order("date", { ascending: false }).limit(1),
  ]);
  const seoScore = ((seo ?? [])[0] as { seo_score: number | null } | undefined)?.seo_score ?? null;
  const psRow = (ps ?? [])[0] as { mobile_score: number | null; desktop_score: number | null } | undefined;
  const psVals = psRow ? [psRow.mobile_score, psRow.desktop_score].filter((v): v is number => v != null) : [];
  const psAvg = psVals.length ? Math.round(psVals.reduce((a, b) => a + b, 0) / psVals.length) : null;
  const h = (health ?? [])[0] as { domain_rating: number | null; organic_traffic: number | null; organic_keywords: number | null } | undefined;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Analytics — {selected.display_name}</h1>
        <span className="text-sm text-slate-500">Monthly KPIs{latestWeek ? ` · ranking week ${latestWeek}` : ""}</span>
      </div>

      <Section title="Ranking">
        <StatCard label="Keywords in Top 10" value={String(top10)} sub={`of ${totalCells}`} />
        <StatCard label="Keywords in Top 3" value={String(top3)} />
        <StatCard label="Ranking (top 100)" value={String(ranked)} sub={`of ${totalCells}`} />
        <StatCard label="Avg position" value={avgPos != null ? String(avgPos) : "—"} sub="ranked only" />
      </Section>
      {trendData.length > 1 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 font-semibold text-slate-900">Keywords in Top 10 over time</div>
          <TrendChart data={trendData} xKey="week_date" yKey="count" />
        </div>
      ) : null}

      <Section title="Backlinks">
        <StatCard label="Total backlinks" value={String(blTotal)} />
        <StatCard label="Indexed" value={blTotal ? `${blIndexed} (${Math.round((blIndexed / blTotal) * 100)}%)` : "—"} />
        <StatCard label="Built this month" value={String(blThisMonth)} sub={thisMonth} />
        <StatCard label="Months active" value={String(blByMonth.size)} />
      </Section>
      {blMonthData.length > 1 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 font-semibold text-slate-900">Backlinks built per month</div>
          <TrendChart data={blMonthData} xKey="month" yKey="count" />
        </div>
      ) : null}

      <Section title="Overall site">
        <StatCard label="SEO Score" value={seoScore != null ? `${seoScore}/100` : "—"} />
        <StatCard label="PageSpeed (avg)" value={psAvg != null ? String(psAvg) : "—"} sub="mobile + desktop" />
        <StatCard label="Domain Rating" value={h?.domain_rating != null ? String(h.domain_rating) : "—"} />
        <StatCard label="Organic Traffic" value={h?.organic_traffic != null ? h.organic_traffic.toLocaleString() : "—"} sub={h?.organic_keywords != null ? `${h.organic_keywords} keywords` : undefined} />
      </Section>
    </div>
  );
}
