import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { signScreenshots } from "@/lib/storage";
import { addSeoPeriod } from "./actions";
import { AddSeoPeriod } from "@/components/entry/AddSeoPeriod";

function scoreColor(n: number | null): string {
  if (n == null) return "text-slate-400";
  if (n >= 90) return "text-green-600";
  if (n >= 70) return "text-amber-600";
  return "text-red-600";
}

type Row = {
  id: string;
  date: string;
  seo_score: number | null;
  passed_tests: number | null;
  warnings: number | null;
  failed_tests: number | null;
  screenshot_path: string | null;
  sites: { display_name: string };
};

export default async function SeoPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const { site } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const isAdmin = isAdminRole(await getCurrentRole());

  const { data: siteList } = await supabase.from("sites").select("id, display_name").order("sort_order");
  const selectedSite = (siteList ?? []).find((s) => s.id === site) ?? (siteList ?? [])[0];
  const today = new Date();
  const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  let q = supabase
    .from("seo_scores")
    .select("id, date, seo_score, passed_tests, warnings, failed_tests, screenshot_path, site_id, sites!inner(display_name, sort_order)")
    .order("date", { ascending: false });
  if (site) q = q.eq("site_id", site);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];

  const signed = await signScreenshots(rows.map((r) => r.screenshot_path));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">SEO Score (Rankmath)</h1>
      {isAdmin && selectedSite ? (
        <AddSeoPeriod defaultDate={defaultDate} action={addSeoPeriod.bind(null, selectedSite.id)} />
      ) : null}
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold text-slate-900">{r.sites.display_name}</span>
            <span className="text-xs text-slate-500">{r.date}</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-bold ${scoreColor(r.seo_score)}`}>{r.seo_score ?? "—"}</span>
                <span className="text-sm text-slate-400">/ 100 SEO score</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md bg-green-50 px-3 py-2 text-center">
                  <div className="font-semibold text-green-700">{r.passed_tests ?? "—"}</div>
                  <div className="text-xs text-slate-500">Passed</div>
                </div>
                <div className="rounded-md bg-amber-50 px-3 py-2 text-center">
                  <div className="font-semibold text-amber-700">{r.warnings ?? "—"}</div>
                  <div className="text-xs text-slate-500">Warnings</div>
                </div>
                <div className="rounded-md bg-red-50 px-3 py-2 text-center">
                  <div className="font-semibold text-red-700">{r.failed_tests ?? "—"}</div>
                  <div className="text-xs text-slate-500">Failed</div>
                </div>
              </div>
            </div>
            <div>
              {r.screenshot_path && signed.get(r.screenshot_path) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signed.get(r.screenshot_path)} alt={`SEO analyzer for ${r.sites.display_name}`} className="w-full rounded-lg border border-slate-200" />
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">No screenshot</div>
              )}
            </div>
          </div>
        </div>
      ))}
      {rows.length === 0 ? <p className="text-sm text-slate-500">No SEO data yet.</p> : null}
    </div>
  );
}
