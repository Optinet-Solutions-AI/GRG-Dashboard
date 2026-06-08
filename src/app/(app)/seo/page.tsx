import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { addSeoPeriod } from "./actions";
import { AddSeoPeriod } from "@/components/entry/AddSeoPeriod";

function scoreColor(n: number | null): string {
  if (n == null) return "bg-slate-200 text-slate-600";
  if (n >= 90) return "bg-green-600 text-white";
  if (n >= 70) return "bg-amber-500 text-white";
  return "bg-red-500 text-white";
}
function Chip({ n }: { n: number | null }) {
  return <span className={`inline-block min-w-[2.75rem] rounded-md px-2 py-1 text-center text-xs font-semibold ${scoreColor(n)}`}>{n ?? "—"}</span>;
}

export default async function SeoPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  const supabase = await createServerSupabaseClient();
  let q = supabase
    .from("seo_scores")
    .select("rankmath_analyzer, seo_homepage, health_score, date, site_id, sites!inner(display_name, sort_order)")
    .order("date", { ascending: false });
  if (site) q = q.eq("site_id", site);
  const { data } = await q;

  // latest per site
  const seen = new Set<string>();
  const rows = (data ?? []).filter((r: Record<string, unknown>) => {
    const id = r.site_id as string;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const isAdmin = isAdminRole(await getCurrentRole());
  let entry = null;
  if (isAdmin) {
    const { data: allSites } = await supabase.from("sites").select("id, display_name").order("sort_order");
    const { data: latestSeo } = await supabase.from("seo_scores").select("site_id, rankmath_analyzer, seo_homepage, health_score, date").order("date", { ascending: false });
    const latestBySite = new Map<string, { rankmath_analyzer: number | null; seo_homepage: number | null; health_score: number | null }>();
    for (const r of (latestSeo ?? []) as Array<{ site_id: string; rankmath_analyzer: number | null; seo_homepage: number | null; health_score: number | null }>) {
      if (!latestBySite.has(r.site_id)) latestBySite.set(r.site_id, r);
    }
    const siteRows = ((allSites ?? []) as Array<{ id: string; display_name: string }>).map((s) => {
      const v = latestBySite.get(s.id);
      return { id: s.id, display_name: s.display_name, rankmath: v?.rankmath_analyzer ?? null, homepage: v?.seo_homepage ?? null, health: v?.health_score ?? null };
    });
    const today = new Date();
    const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    entry = <AddSeoPeriod sites={siteRows} defaultDate={defaultDate} action={addSeoPeriod} />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">SEO Score</h1>
      {entry}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-2 font-medium">Site</th>
              <th className="px-4 py-2 font-medium">Rankmath Analyzer</th>
              <th className="px-4 py-2 font-medium">SEO / Homepages</th>
              <th className="px-4 py-2 font-medium">Health Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: Record<string, unknown>, i: number) => {
              const s = r.sites as { display_name?: string } | null;
              return (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{s?.display_name ?? "—"}</td>
                  <td className="px-4 py-2"><Chip n={r.rankmath_analyzer as number | null} /></td>
                  <td className="px-4 py-2"><Chip n={r.seo_homepage as number | null} /></td>
                  <td className="px-4 py-2"><Chip n={r.health_score as number | null} /></td>
                </tr>
              );
            })}
            {rows.length === 0 ? <tr><td colSpan={4} className="px-4 py-3 text-slate-500">No SEO data.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
